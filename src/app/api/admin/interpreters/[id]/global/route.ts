// PRD #16 S1 — 통역사 글로벌 필드 편집 API.
// RPC update_interpreter_global_fields (마이그 044) 가 admin 검증 + enum/음수 검증 수행.
// 본 라우트는 admin guard + 입력 가드 + RPC 호출만.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureAdmin } from '@/lib/auth/guards';
import { updateGlobalFields } from '@/lib/interpreter/repository';
import type { InterpreterGrade, InterpreterRehireStatus } from '@/types';

const GRADE_VALUES: InterpreterGrade[] = ['특급', '우수', '보통', '주의'];
const REHIRE_VALUES: InterpreterRehireStatus[] = ['가능', '불가', '보류'];

type ValidateResult<T> = { ok: true; value: T | null } | { ok: false; reason: string };

// null/undefined/빈문자열은 "미설정". 그 외 값이 enum 에 없으면 거부 (400).
function validateGrade(v: unknown): ValidateResult<InterpreterGrade> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, reason: '등급 값이 문자열이 아닙니다.' };
  if (!(GRADE_VALUES as string[]).includes(v)) return { ok: false, reason: `유효하지 않은 등급: ${v}` };
  return { ok: true, value: v as InterpreterGrade };
}

function validateRehire(v: unknown): ValidateResult<InterpreterRehireStatus> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, reason: '재섭외 값이 문자열이 아닙니다.' };
  if (!(REHIRE_VALUES as string[]).includes(v)) return { ok: false, reason: `유효하지 않은 재섭외 상태: ${v}` };
  return { ok: true, value: v as InterpreterRehireStatus };
}

function validateRate(v: unknown): ValidateResult<number> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    return { ok: false, reason: '기준 요율은 0 이상의 숫자여야 합니다.' };
  }
  return { ok: true, value: v };
}

function validateNotes(v: unknown): ValidateResult<string> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, reason: '비고는 텍스트여야 합니다.' };
  if (v.length > 8000) return { ok: false, reason: '비고가 너무 깁니다 (최대 8000자).' };
  return { ok: true, value: v };
}

// Supabase RPC 가 throw 하는 객체는 PostgrestError shape. plain object 라 instanceof Error 가 false.
// 메시지 + code 추출 후 4xx/5xx 매핑.
function extractErrorMeta(err: unknown): { message: string; code: string | null } {
  if (err && typeof err === 'object') {
    const obj = err as { message?: unknown; code?: unknown };
    const message =
      typeof obj.message === 'string' && obj.message.length > 0 ? obj.message : '저장 실패';
    const code = typeof obj.code === 'string' ? obj.code : null;
    return { message, code };
  }
  return { message: typeof err === 'string' ? err : '저장 실패', code: null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 });

  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '본문이 JSON 객체여야 합니다.' }, { status: 400 });
  }

  const grade = validateGrade(body.grade);
  if (!grade.ok) return NextResponse.json({ error: grade.reason }, { status: 400 });

  const rehire = validateRehire(body.rehire_status);
  if (!rehire.ok) return NextResponse.json({ error: rehire.reason }, { status: 400 });

  const rate = validateRate(body.base_rate);
  if (!rate.ok) return NextResponse.json({ error: rate.reason }, { status: 400 });

  const notes = validateNotes(body.global_notes);
  if (!notes.ok) return NextResponse.json({ error: notes.reason }, { status: 400 });

  try {
    await updateGlobalFields(supabase, id, {
      grade: grade.value,
      baseRate: rate.value,
      rehireStatus: rehire.value,
      globalNotes: notes.value,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const { message, code } = extractErrorMeta(err);
    // RPC 가 raise 한 도메인 키워드 + Postgres SQLSTATE 매핑.
    //   42501 = insufficient_privilege (RPC 의 not_admin RAISE)
    //   target_not_found / target_not_interpreter = 마이그 044 RPC 메시지
    //   invalid_grade / invalid_rehire_status = 마이그 044 RPC 메시지
    //   22P02 = invalid_text_representation (잘못된 UUID 등)
    const isClientErr =
      code === '42501' ||
      code === '22P02' ||
      /target_not_(found|interpreter)|invalid_(grade|rehire_status)|not_admin/i.test(message);
    return NextResponse.json({ error: message }, { status: isClientErr ? 400 : 500 });
  }
}
