// PRD #19 M5 — 5-variant 풀 캐시 매니저.
//
// 결정 D6: 캐시 키 = (consultation_id, context_hash='v1') — K1.
// textarea 1글자 수정마다 풀 깨지면 비용 폭증. consultation 단위로 풀 1개.
//
// 클라이언트가 variant_index 를 추적하고 증가시켜 보낸다 (UI 의 "시안 N/5" chip).
// 서버는 단순 캐시 lookup + insert. 한 풀 = 최대 5 row.
//
// RLS: ai_answer_pool 의 INSERT 정책 0건 → service_role 키로만 가능.
// 호출자는 createAdminClient() 로 넘긴 supabase 를 전달.
//
// 본 모듈은 pure(ish) — DB 만 조회. LLM 호출 없음.

import type { SupabaseClient } from '@supabase/supabase-js';

export const CONTEXT_HASH = 'v1';
export const POOL_SIZE_CAP = 5;

export interface PoolRow {
  variant_index: number;
  content: string;
}

export interface PoolHit {
  hit: true;
  content: string;
  variantIndex: number;
  poolSize: number;
}

export interface PoolMiss {
  hit: false;
  poolSize: number;
}

export interface InsertInput {
  consultationId: string;
  variantIndex: number;
  content: string;
  temperature: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

/** 캐시 조회. variantIndex 행이 있으면 hit. 없으면 miss + 현재 풀 사이즈. */
export async function lookupPoolEntry(
  supabase: SupabaseClient,
  consultationId: string,
  variantIndex: number,
): Promise<PoolHit | PoolMiss> {
  const safeIndex = clampIndex(variantIndex);

  const { data: rows, error } = await supabase
    .from('ai_answer_pool')
    .select('variant_index, content')
    .eq('consultation_id', consultationId)
    .eq('context_hash', CONTEXT_HASH)
    .order('variant_index', { ascending: true });

  if (error) {
    throw new Error(`ai_answer_pool 조회 실패: ${error.message}`);
  }

  const poolRows = (rows ?? []) as PoolRow[];
  const poolSize = poolRows.length;

  const hit = poolRows.find((r) => r.variant_index === safeIndex);
  if (hit) {
    return { hit: true, content: hit.content, variantIndex: safeIndex, poolSize };
  }
  return { hit: false, poolSize };
}

export interface InsertResult {
  stored: boolean;          // 본 insert 가 새 row 를 저장했는지
  canonicalContent: string; // DB 진실: 충돌 시 기존 row content, 성공 시 input.content
}

/**
 * 신규 시안 캐시. UNIQUE 충돌(동시 호출 race) 시 기존 캐시 row 의 content 를
 * 반환해 호출자가 응답을 DB 진실로 정렬하도록 한다. 캐시-응답 일관성 보장.
 */
export async function insertPoolEntry(
  supabase: SupabaseClient,
  input: InsertInput,
): Promise<InsertResult> {
  const safeIndex = clampIndex(input.variantIndex);
  const { error } = await supabase.from('ai_answer_pool').insert({
    consultation_id: input.consultationId,
    context_hash: CONTEXT_HASH,
    variant_index: safeIndex,
    content: input.content,
    temperature: input.temperature,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    cost_usd: input.costUsd,
  });

  if (!error) {
    return { stored: true, canonicalContent: input.content };
  }

  // 23505 = unique_violation. 다른 동시 호출이 이미 같은 (consultation, hash, slot) 채움.
  if (error.code === '23505') {
    const { data: existing, error: refetchErr } = await supabase
      .from('ai_answer_pool')
      .select('content')
      .eq('consultation_id', input.consultationId)
      .eq('context_hash', CONTEXT_HASH)
      .eq('variant_index', safeIndex)
      .maybeSingle();
    if (refetchErr) {
      throw new Error(`ai_answer_pool 충돌 후 재조회 실패: ${refetchErr.message}`);
    }
    const canonical = typeof existing?.content === 'string' ? existing.content : input.content;
    return { stored: false, canonicalContent: canonical };
  }

  throw new Error(`ai_answer_pool insert 실패: ${error.message}`);
}

/** 풀 hit 여부 라벨 (admin 모니터링 카드용). */
export async function getPoolSize(
  supabase: SupabaseClient,
  consultationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('ai_answer_pool')
    .select('id', { count: 'exact', head: true })
    .eq('consultation_id', consultationId)
    .eq('context_hash', CONTEXT_HASH);
  if (error) {
    throw new Error(`ai_answer_pool count 실패: ${error.message}`);
  }
  return count ?? 0;
}

/** 클라이언트가 음수/NaN/5+ 보낼 때 0..4 로 강제. wrap-around = % 5. */
export function clampIndex(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const n = Math.floor(raw);
  if (n < 0) return 0;
  return n % POOL_SIZE_CAP;
}
