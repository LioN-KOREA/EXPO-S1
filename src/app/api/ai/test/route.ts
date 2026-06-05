// PRD #19 PoC — AI 상담일지 답변 테스트 엔드포인트.
// admin only. consultation_id + (optional) variant_index + (optional) formValues 받아 LLM 호출.
//
// 본 라우트는 PoC 전용. 정식 구현 (S1 ~ S2) 시 /api/ai/auto-answer 로 대체.
// rate limit / 일일 cap / 풀 캐시 / ai_call_logs 기록 모두 미적용.
//
// curl 예시:
//   curl -X POST http://localhost:3000/api/ai/test \
//     -H 'Content-Type: application/json' \
//     --cookie "$(cat .cookies)" \
//     -d '{"consultation_id":"...","variant_index":0}'

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureRole } from '@/lib/auth/guards';
import { buildPrompt } from '@/lib/ai/prompt-builder';
import { callOpenAI, OpenAIError } from '@/lib/ai/openai-client';

interface RequestBody {
  consultation_id?: unknown;
  variant_index?: unknown;
  form_values?: unknown;
}

export async function POST(request: NextRequest) {
  // Kill switch — 기본 false (운영 안전). 사용 시 env 에 명시적으로 'true' 설정.
  if (process.env.AI_AUTO_ANSWER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'AI 자동 답변 기능이 비활성화 상태입니다.' }, { status: 503 });
  }

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

  const variantIndexRaw = body.variant_index;
  const variantIndex =
    typeof variantIndexRaw === 'number' && Number.isInteger(variantIndexRaw) && variantIndexRaw >= 0 && variantIndexRaw <= 4
      ? variantIndexRaw
      : 0;

  const overrideFormValues =
    body.form_values && typeof body.form_values === 'object' && !Array.isArray(body.form_values)
      ? (body.form_values as Record<string, unknown>)
      : null;

  // consultation + buyer + seller 로드. 본인 배정 consultation 만 허용 (PRD #19 Q9).
  const { data: consultation, error: consultErr } = await supabase
    .from('consultations')
    .select(
      'id, interpreter_id, buyer:buyers(company_name, country), seller:sellers(company_name, company_name_kr, extra_info)',
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

  // 최신 report 의 data 를 form_values 로 사용 (override 우선).
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

  const prompt = buildPrompt({
    consultation: {
      buyer: Array.isArray(consultation.buyer) ? consultation.buyer[0] : consultation.buyer,
      seller: Array.isArray(consultation.seller) ? consultation.seller[0] : consultation.seller,
    },
    formValues,
    variantIndex,
  });

  try {
    const result = await callOpenAI({
      system: prompt.system,
      user: prompt.user,
      temperature: prompt.temperature,
    });

    // 응답에는 content + 통역사 화면용 메타만. prompt / temperature / system 노출 X.
    return NextResponse.json({
      variant_index: variantIndex,
      content: result.content,
    });
  } catch (err) {
    if (err instanceof OpenAIError) {
      const status =
        err.kind === 'timeout' ? 504 :
        err.kind === 'rate_limit' ? 429 :
        err.kind === 'http_5xx' ? 502 :
        err.kind === 'auth' ? 500 :
        err.kind === 'invalid_response' ? 502 :
        500;
      return NextResponse.json({ error: err.message, kind: err.kind }, { status });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown error' }, { status: 500 });
  }
}
