// PRD #16 통역사 관리 도메인 저장소 (deep module).
// 외부 IF 4종:
//   - listInterpreters: 목록 + meta + 이벤트 칩 + 평가 카운트
//   - getInterpreterWithHistory: 상세 = 프로필 + meta + 참여 이벤트 + 평가
//   - upsertEvaluation: UNIQUE(interpreter_id, event_id)
//   - updateGlobalFields: update_interpreter_global_fields RPC 래퍼
//
// interpreter_global_meta + interpreter_evaluations 는 admin-only RLS.
// 호출 컨벤션:
//   - listInterpreters / getInterpreterWithHistory: admin 인증 client 또는 service_role 모두 OK
//   - upsertEvaluation: admin 인증 client (RLS 통과). service_role 도 RLS 우회로 가능.
//   - updateGlobalFields: **admin 인증 client 필수**. RPC 가 auth.uid() 기반 admin 검증 +
//     authenticated 에만 EXECUTE 권한 → service_role 호출은 auth.uid()=NULL 로 거부됨.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InterpreterEvaluation,
  InterpreterEventParticipation,
  InterpreterGlobalMeta,
  InterpreterGrade,
  InterpreterRehireStatus,
  InterpreterWithHistory,
  Profile,
} from '@/types';

export interface InterpreterListItem {
  profile: Profile;
  meta: InterpreterGlobalMeta | null;
  events: InterpreterEventParticipation[];
  evaluation_count: number;
}

export interface ListInterpretersFilter {
  search?: string;
  gradeFilter?: InterpreterGrade | null;
  rehireFilter?: InterpreterRehireStatus | null;
}

export interface UpsertEvaluationInput {
  interpreterId: string;
  eventId: string;
  comment: string | null;
  notes: string | null;
  paidRate: number | null;
  evaluatedBy: string;
}

export interface UpdateGlobalFieldsInput {
  grade: InterpreterGrade | null;
  baseRate: number | null;
  rehireStatus: InterpreterRehireStatus | null;
  globalNotes: string | null;
}

// ---- 1. listInterpreters -------------------------------------------------

// PostgREST `.or()` value 는 콤마/점/괄호/따옴표가 reserved.
// 안전 escape = (1) 사용자 입력의 LIKE wildcard 무력화 + (2) PostgREST double-quote 안에서 `\`/`"` escape.
// `*` 와 `?` 는 PostgREST ilike wildcard 이므로 입력에서 제거.
function escapeSearchTerm(raw: string): string {
  // 1. PostgREST ilike wildcard (* ?) 와 LIKE wildcard (% _) 둘 다 literal 화: 특수 문자 제거.
  // 2. PostgREST `.or()` 구분자(`.,()`)도 안전하게 처리하려고 double-quote 감싸기 전제.
  const stripped = raw.replace(/[*?%_]/g, '');
  // 3. double-quote 안에서 `\`, `"` escape.
  return stripped.replace(/[\\"]/g, '\\$&');
}

export async function listInterpreters(
  supabase: SupabaseClient,
  filter: ListInterpretersFilter = {},
): Promise<InterpreterListItem[]> {
  // 통역사 profiles
  let profileQuery = supabase
    .from('profiles')
    .select('id, email, name, role, phone, language, company_name, country, extra_info, linked_buyer_id, linked_seller_id, must_change_password, created_at')
    .eq('role', 'interpreter');

  const trimmedSearch = filter.search?.trim() ?? '';
  if (trimmedSearch) {
    const term = escapeSearchTerm(trimmedSearch);
    if (term) {
      // double-quote 로 감싸 콤마/점 등 PostgREST reserved char 노출 방어.
      profileQuery = profileQuery.or(
        `name.ilike."*${term}*",email.ilike."*${term}*",phone.ilike."*${term}*"`,
      );
    }
  }

  const { data: profiles, error: profileErr } = await profileQuery.order('name', { ascending: true });
  if (profileErr) throw profileErr;

  const interpreterIds = (profiles ?? []).map((p) => (p as Profile).id);
  if (interpreterIds.length === 0) return [];

  // meta join
  const { data: metaRows, error: metaErr } = await supabase
    .from('interpreter_global_meta')
    .select('*')
    .in('interpreter_id', interpreterIds);
  if (metaErr) throw metaErr;

  const metaById = new Map<string, InterpreterGlobalMeta>();
  for (const m of (metaRows ?? []) as InterpreterGlobalMeta[]) {
    metaById.set(m.interpreter_id, m);
  }

  // 이벤트 칩 (soft-delete 제외)
  const { data: assignments, error: assignErr } = await supabase
    .from('event_interpreters')
    .select('interpreter_id, events!inner(id, name, start_date, end_date, deleted_at)')
    .in('interpreter_id', interpreterIds);
  if (assignErr) throw assignErr;

  const eventsByInterpreter = new Map<string, InterpreterEventParticipation[]>();
  type EventRel = { id: string; name: string; start_date: string; end_date: string; deleted_at: string | null };
  for (const raw of (assignments ?? []) as unknown[]) {
    const row = raw as { interpreter_id: string; events: EventRel | EventRel[] | null };
    // supabase-js 의 join 결과는 객체 또는 배열로 추론. 단일/다중 케이스 모두 처리.
    const evs: EventRel[] = Array.isArray(row.events)
      ? row.events
      : row.events
        ? [row.events]
        : [];
    for (const ev of evs) {
      if (ev.deleted_at) continue;
      const list = eventsByInterpreter.get(row.interpreter_id) ?? [];
      list.push({
        event_id: ev.id,
        event_name: ev.name,
        start_date: ev.start_date,
        end_date: ev.end_date,
      });
      eventsByInterpreter.set(row.interpreter_id, list);
    }
  }

  // 평가 카운트
  const { data: evalCounts, error: evalErr } = await supabase
    .from('interpreter_evaluations')
    .select('interpreter_id')
    .in('interpreter_id', interpreterIds);
  if (evalErr) throw evalErr;

  const evalCountByInterpreter = new Map<string, number>();
  for (const row of (evalCounts ?? []) as Array<{ interpreter_id: string }>) {
    evalCountByInterpreter.set(row.interpreter_id, (evalCountByInterpreter.get(row.interpreter_id) ?? 0) + 1);
  }

  // 필터 — meta 의 grade/rehire 는 in-memory 적용 (RLS 통과 후 row 매핑).
  // (DB 측 inner join 으로 좁히면 meta 가 없는 통역사가 사라지는 부작용 → 의도 안 함)
  let items: InterpreterListItem[] = (profiles ?? []).map((p) => {
    const events = (eventsByInterpreter.get((p as Profile).id) ?? []).slice();
    events.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return {
      profile: p as Profile,
      meta: metaById.get((p as Profile).id) ?? null,
      events,
      evaluation_count: evalCountByInterpreter.get((p as Profile).id) ?? 0,
    };
  });

  if (filter.gradeFilter) {
    items = items.filter((i) => i.meta?.grade === filter.gradeFilter);
  }
  if (filter.rehireFilter) {
    items = items.filter((i) => i.meta?.rehire_status === filter.rehireFilter);
  }

  return items;
}

// ---- 2. getInterpreterWithHistory ---------------------------------------

export async function getInterpreterWithHistory(
  supabase: SupabaseClient,
  interpreterId: string,
): Promise<InterpreterWithHistory | null> {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, name, role, phone, language, company_name, country, extra_info, linked_buyer_id, linked_seller_id, must_change_password, created_at')
    .eq('id', interpreterId)
    .eq('role', 'interpreter')
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) return null;

  const { data: meta, error: metaErr } = await supabase
    .from('interpreter_global_meta')
    .select('*')
    .eq('interpreter_id', interpreterId)
    .maybeSingle();
  if (metaErr) throw metaErr;

  const { data: assignments, error: assignErr } = await supabase
    .from('event_interpreters')
    .select('events!inner(id, name, start_date, end_date, deleted_at)')
    .eq('interpreter_id', interpreterId);
  if (assignErr) throw assignErr;

  type EventRel = { id: string; name: string; start_date: string; end_date: string; deleted_at: string | null };
  const eventRows: EventRel[] = [];
  for (const raw of (assignments ?? []) as unknown[]) {
    const row = raw as { events: EventRel | EventRel[] | null };
    const evs: EventRel[] = Array.isArray(row.events)
      ? row.events
      : row.events
        ? [row.events]
        : [];
    for (const ev of evs) eventRows.push(ev);
  }
  const events: InterpreterEventParticipation[] = eventRows
    .filter((ev) => !ev.deleted_at)
    .map((ev) => ({
      event_id: ev.id,
      event_name: ev.name,
      start_date: ev.start_date,
      end_date: ev.end_date,
    }))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  const { data: evaluations, error: evalErr } = await supabase
    .from('interpreter_evaluations')
    .select('*')
    .eq('interpreter_id', interpreterId)
    .order('evaluated_at', { ascending: false });
  if (evalErr) throw evalErr;

  return {
    profile: profile as Profile,
    meta: (meta as InterpreterGlobalMeta | null) ?? null,
    events,
    evaluations: (evaluations ?? []) as InterpreterEvaluation[],
  };
}

// ---- 3. upsertEvaluation -----------------------------------------------

export async function upsertEvaluation(
  supabase: SupabaseClient,
  input: UpsertEvaluationInput,
): Promise<InterpreterEvaluation> {
  // 사전 검증 (PRD US27): 해당 이벤트에 배정된 통역사인지
  const { data: assignment, error: assignErr } = await supabase
    .from('event_interpreters')
    .select('interpreter_id')
    .eq('interpreter_id', input.interpreterId)
    .eq('event_id', input.eventId)
    .maybeSingle();
  if (assignErr) throw assignErr;
  if (!assignment) {
    throw new Error('interpreter_not_assigned_to_event');
  }

  const { data, error } = await supabase
    .from('interpreter_evaluations')
    .upsert(
      {
        interpreter_id: input.interpreterId,
        event_id: input.eventId,
        comment: input.comment,
        notes: input.notes,
        paid_rate: input.paidRate,
        evaluated_by: input.evaluatedBy,
        evaluated_at: new Date().toISOString(),
      },
      { onConflict: 'interpreter_id,event_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as InterpreterEvaluation;
}

// ---- 4. updateGlobalFields ---------------------------------------------

export async function updateGlobalFields(
  supabase: SupabaseClient,
  interpreterId: string,
  input: UpdateGlobalFieldsInput,
): Promise<void> {
  const { error } = await supabase.rpc('update_interpreter_global_fields', {
    p_id: interpreterId,
    p_grade: input.grade,
    p_base_rate: input.baseRate,
    p_rehire_status: input.rehireStatus,
    p_global_notes: input.globalNotes,
  });
  if (error) throw error;
}
