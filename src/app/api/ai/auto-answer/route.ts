// PRD #19 M7 — AI 자동 답변 정식 엔드포인트.
//
// orchestrate:
//   1. ensureRole(['interpreter']) + 본인 배정 consultation 검증
//   2. form_values / template 로드
//   3. kill switch off → 폴백 동봉 (PRD §Solution "통역사 실패 비노출")
//   4. 5-pool lookup → 캐시 hit 시 LLM 호출 없이 반환 (cache_hit 로그)
//   5. rate limit (분당 10) + 일일 cap ($10) → 차단 시 폴백 동봉
//   6. OpenAI 호출 → 성공 시 pool insert + ai_call_logs success
//      └ insert race (UNIQUE 충돌) 시 DB 진실 우선 반환
//   7. 실패 시 폴백 동봉 + 상태별 ai_call_logs (timeout/http_5xx/...)
//      └ status 는 원인 그대로, error_message 에 fallback_served=true 태그
//
// 응답: { variant_index, pool_size, content, source: 'llm' | 'template_fallback' }
// HTTP 200 = 통역사 화면 답변 수신 성공 (LLM 또는 폴백). 인증/입력 오류만 4xx/5xx.
//
// 인증/RLS: ai_answer_pool/ai_call_logs INSERT 정책 0건 → service_role 클라이언트로 기록.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureRole } from '@/lib/auth/guards';
import { buildPrompt } from '@/lib/ai/prompt-builder';
import { callOpenAI, OpenAIError, OPENAI_MODEL } from '@/lib/ai/openai-client';
import { buildTemplateFallback } from '@/lib/ai/fallback-adapter';
import {
  POOL_SIZE_CAP,
  clampIndex,
  insertPoolEntry,
  lookupPoolEntry,
} from '@/lib/ai/pool-manager';
import { reserveCall } from '@/lib/ai/rate-limiter';

interface RequestBody {
  consultation_id?: unknown;
  variant_index?: unknown;
  form_values?: unknown;
}

type CallStatus =
  | 'success'
  | 'cache_hit'
  | 'timeout'
  | 'http_5xx'
  | 'rate_limit'
  | 'kill_switch'
  | 'daily_cap'
  | 'invalid_response'
  | 'template_fallback'
  | 'auth_error'
  | 'unknown_error';

interface LogInput {
  consultationId: string | null;
  eventId: string | null;
  userId: string;
  status: CallStatus;
  promptText?: string | null;
  completionText?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
  errorMessage?: string | null;
}

const FALLBACK_SERVED_TAG = '; fallback_served=true';

function appendFallbackTag(msg: string | null | undefined): string {
  const base = (msg ?? '').trim();
  return base ? `${base}${FALLBACK_SERVED_TAG}` : 'fallback_served=true';
}

/** 양식 폴백도 없을 때 최후 안전망. 회사명·국가만으로 한 문장 합성. */
function minimalFallback(input: {
  buyer?: { company_name?: string | null; country?: string | null } | null;
  seller?: { company_name?: string | null; company_name_kr?: string | null } | null;
}): string {
  const sellerName =
    input.seller?.company_name_kr?.trim() || input.seller?.company_name?.trim() || '국내기업';
  const buyerName = input.buyer?.company_name?.trim() || '해외바이어';
  const country = input.buyer?.country?.trim();
  const countryPart = country ? `(${country}) ` : '';
  return `${sellerName}와 ${buyerName}${countryPart}간 수출 상담이 진행되었다. 세부 내용은 추가 작성이 필요하다.`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureRole(supabase, ['interpreter']);
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '본문이 JSON 객체여야 합니다.' }, { status: 400 });
  }

  const consultationId = typeof body.consultation_id === 'string' ? body.consultation_id : null;
  if (!consultationId) {
    return NextResponse.json({ error: 'consultation_id 누락' }, { status: 400 });
  }

  const variantIndex = clampIndex(
    typeof body.variant_index === 'number' ? body.variant_index : 0,
  );

  const overrideFormValues =
    body.form_values && typeof body.form_values === 'object' && !Array.isArray(body.form_values)
      ? (body.form_values as Record<string, unknown>)
      : null;

  const { data: consultation, error: consultErr } = await supabase
    .from('consultations')
    .select(
      'id, event_id, interpreter_id, buyer:buyers(company_name, country), seller:sellers(company_name, company_name_kr, contact_name, extra_info)',
    )
    .eq('id', consultationId)
    .eq('interpreter_id', guard.user.id)
    .maybeSingle();

  if (consultErr) {
    return NextResponse.json({ error: `consultation 조회 실패: ${consultErr.message}` }, { status: 500 });
  }
  if (!consultation) {
    return NextResponse.json({ error: '본인에게 배정된 consultation 이 아닙니다.' }, { status: 403 });
  }
  const eventId = consultation.event_id as string;

  let formValues: Record<string, unknown> = {};
  if (overrideFormValues) {
    formValues = overrideFormValues;
  } else {
    const { data: report } = await supabase
      .from('consultation_reports')
      .select('data')
      .eq('consultation_id', consultationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (report?.data && typeof report.data === 'object' && !Array.isArray(report.data)) {
      formValues = report.data as Record<string, unknown>;
    }
  }

  const { data: templateRow } = await supabase
    .from('report_templates')
    .select('fields, auto_answer_template')
    .eq('event_id', eventId)
    .maybeSingle();

  const buyer = Array.isArray(consultation.buyer) ? consultation.buyer[0] : consultation.buyer;
  const seller = Array.isArray(consultation.seller) ? consultation.seller[0] : consultation.seller;

  const admin = createAdminClient();
  const log = async (input: LogInput) => {
    try {
      await admin.from('ai_call_logs').insert({
        consultation_id: input.consultationId,
        event_id: input.eventId,
        user_id: input.userId,
        model: OPENAI_MODEL,
        status: input.status,
        prompt_text: input.promptText ?? null,
        completion_text: input.completionText ?? null,
        prompt_tokens: input.promptTokens ?? null,
        completion_tokens: input.completionTokens ?? null,
        cost_usd: input.costUsd ?? null,
        error_message: input.errorMessage ?? null,
      });
    } catch {
      // 로그 실패는 본 요청 흐름 차단 X.
    }
  };

  /** 양식 폴백 → minimal 폴백 순. 항상 non-null content 반환 (PRD §Solution). */
  const serveFallback = (): string =>
    buildTemplateFallback({
      templateRow,
      formValues,
      consultation: { buyer, seller },
    }) ?? minimalFallback({ buyer, seller });

  // PRD §Solution: kill switch off 도 폴백 동봉. HTTP 200 + source='template_fallback'.
  if (process.env.AI_AUTO_ANSWER_ENABLED !== 'true') {
    const content = serveFallback();
    await log({
      consultationId,
      eventId,
      userId: guard.user.id,
      status: 'kill_switch',
      completionText: content,
      errorMessage: appendFallbackTag('AI_AUTO_ANSWER_ENABLED=false'),
    });
    return NextResponse.json({
      variant_index: variantIndex,
      pool_size: 0,
      content,
      source: 'template_fallback',
    });
  }

  // 5-pool 캐시 lookup. service_role 로 (RLS 우회 + INSERT 가능).
  const cached = await lookupPoolEntry(admin, consultationId, variantIndex).catch((e: Error) => {
    return { error: e.message } as { error: string };
  });
  if (!('error' in cached) && cached.hit) {
    await log({
      consultationId,
      eventId,
      userId: guard.user.id,
      status: 'cache_hit',
      completionText: cached.content,
    });
    return NextResponse.json({
      variant_index: cached.variantIndex,
      pool_size: cached.poolSize,
      content: cached.content,
      source: 'llm',
    });
  }

  const currentPoolSize = !('error' in cached) ? cached.poolSize : 0;

  // rate limit (분당 10, hard) + 일일 cap ($10). 예약 마커 INSERT 로 동시성 방어(마이그 052).
  const limit = await reserveCall(admin, { userId: guard.user.id, eventId });
  if (!limit.allowed) {
    const content = serveFallback();
    const reasonMsg =
      limit.reason === 'minute_cap'
        ? `분당 ${limit.currentCount}회`
        : `일일 누적 ${limit.currentCostUsd?.toFixed(4)} USD`;
    await log({
      consultationId,
      eventId,
      userId: guard.user.id,
      status: limit.reason === 'minute_cap' ? 'rate_limit' : 'daily_cap',
      completionText: content,
      errorMessage: appendFallbackTag(reasonMsg),
    });
    return NextResponse.json({
      variant_index: variantIndex,
      pool_size: currentPoolSize,
      content,
      source: 'template_fallback',
    });
  }

  // 풀이 가득 차 있는데 hit 가 아니다 = 직전 캐시 race. 한 번 재조회.
  if (currentPoolSize >= POOL_SIZE_CAP) {
    const refetched = await lookupPoolEntry(admin, consultationId, variantIndex).catch(() => null);
    if (refetched && !('error' in refetched) && refetched.hit) {
      await log({
        consultationId,
        eventId,
        userId: guard.user.id,
        status: 'cache_hit',
        completionText: refetched.content,
      });
      return NextResponse.json({
        variant_index: refetched.variantIndex,
        pool_size: refetched.poolSize,
        content: refetched.content,
        source: 'llm',
      });
    }
  }

  // 새 시안 LLM 호출. 신규 variantIndex = 현재 poolSize.
  const nextSlot = Math.min(currentPoolSize, POOL_SIZE_CAP - 1);
  const prompt = buildPrompt({
    consultation: { buyer, seller },
    formValues,
    variantIndex: nextSlot,
  });

  try {
    const result = await callOpenAI({
      system: prompt.system,
      user: prompt.user,
      temperature: prompt.temperature,
    });

    // 풀 insert. 3 결과 분기:
    //   stored=true        → 본 호출이 캐시에 저장 (정상)
    //   stored=false       → UNIQUE race: 다른 호출이 채움, canonical = DB 진실
    //   insertFailed=true  → DB 오류 등: 캐시 미저장, 응답은 LLM 결과 유지
    let canonical = result.content;
    let stored = false;
    let insertFailed = false;
    let insertError: string | null = null;
    try {
      const ins = await insertPoolEntry(admin, {
        consultationId,
        variantIndex: nextSlot,
        content: result.content,
        temperature: prompt.temperature,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: result.costUsd,
      });
      canonical = ins.canonicalContent;
      stored = ins.stored;
    } catch (e) {
      insertFailed = true;
      insertError = e instanceof Error ? e.message : 'cache_insert_failed';
    }

    // pool_size:
    //   stored 또는 race_lost → DB row +1 (다른 호출이 채움)
    //   insertFailed → DB row 미증가 → currentPoolSize 유지
    const newPoolSize = insertFailed
      ? currentPoolSize
      : Math.min(currentPoolSize + 1, POOL_SIZE_CAP);

    await log({
      consultationId,
      eventId,
      userId: guard.user.id,
      status: 'success',
      promptText: prompt.user,
      completionText: stored ? result.content : canonical,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
      errorMessage: insertFailed
        ? `cache_insert_failed: ${insertError}`
        : stored
          ? null
          : 'race_lost: returned canonical from concurrent insert',
    });

    return NextResponse.json({
      variant_index: nextSlot,
      pool_size: newPoolSize,
      content: canonical,
      source: 'llm',
    });
  } catch (err) {
    // LLM 실패 → 폴백 동봉. status 는 원인 그대로, error_message 에 fallback_served=true 태그.
    const content = serveFallback();

    const status: CallStatus =
      err instanceof OpenAIError
        ? err.kind === 'timeout'
          ? 'timeout'
          : err.kind === 'rate_limit'
            ? 'rate_limit'
            : err.kind === 'http_5xx'
              ? 'http_5xx'
              : err.kind === 'auth'
                ? 'auth_error'
                : err.kind === 'invalid_response'
                  ? 'invalid_response'
                  : 'unknown_error'
        : 'unknown_error';

    await log({
      consultationId,
      eventId,
      userId: guard.user.id,
      status,
      promptText: prompt.user,
      completionText: content,
      errorMessage: appendFallbackTag(err instanceof Error ? err.message : 'unknown'),
    });

    return NextResponse.json({
      variant_index: variantIndex,
      pool_size: currentPoolSize,
      content,
      source: 'template_fallback',
    });
  }
}
