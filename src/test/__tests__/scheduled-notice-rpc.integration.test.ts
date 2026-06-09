/**
 * scheduled_notices RPC 통합 테스트 — 마이그 040 검증.
 *
 * 정책 (docs/testing.md §5.3):
 * - 단위 테스트 jsdom 트랙은 Supabase 직접 호출 금지 → 본 파일은 *.integration.test.ts.
 * - 로컬 Supabase (`supabase start`) 필요.
 * - 환경변수 누락 시 전부 skip — CI 환경에서는 통합 트랙 비활성, 로컬에서만 실행.
 *
 * 검증 범위 (PRD #10 / S1 #12 Acceptance):
 * - 5개 RPC 외부 행동 (정상 + 모든 RAISE 분기)
 * - service_role vs impersonated 양방향 RLS
 * - race 시나리오 (동시 update + dispatch → not_scheduled / SKIP LOCKED)
 * - notices.recipient_user_ids ALTER 회귀 (broadcast NULL 동작 보존)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// supabase 인스턴스가 살아있는지 사전 ping. 환경변수만 있고 서버 미기동 시 skip.
async function isSupabaseAlive(): Promise<boolean> {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const alive = await isSupabaseAlive();
const describeIntegration = alive ? describe : describe.skip;

if (!alive) {
  describe('scheduled_notices RPC (integration)', () => {
    it.skip('로컬 supabase 미기동 — skip', () => {});
  });
}

// ==== 헬퍼 ====
function uniqueEmail(prefix: string): string {
  // crypto.randomUUID 는 node 18+ 에서 global
  return `${prefix}-${crypto.randomUUID()}@context.test`;
}

async function createAuthUser(
  admin: SupabaseClient,
  role: 'admin' | 'interpreter',
): Promise<{ id: string; email: string; password: string }> {
  const email = uniqueEmail(`s-noti-${role}`);
  const password = 'Test1234!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');

  const { error: profErr } = await admin.from('profiles').insert({
    id: data.user.id,
    email,
    name: `테스트-${role}`,
    role,
  });
  if (profErr) throw profErr;

  return { id: data.user.id, email, password };
}

async function impersonate(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error('signIn failed');
  return client;
}

// ==== 메인 ====
describeIntegration('scheduled_notices RPC (integration)', () => {
  let admin: SupabaseClient;

  // 컨텍스트 — 각 테스트 그룹에서 공유
  let adminUser: { id: string; email: string; password: string };
  let interp1: { id: string; email: string; password: string };
  let interp2: { id: string; email: string; password: string };
  let outsider: { id: string; email: string; password: string }; // 행사 미배정
  let eventId: string;
  // 정리할 user id 목록
  const createdUserIds: string[] = [];
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    // 1) admin / interpreter user 발급
    adminUser = await createAuthUser(admin, 'admin');
    interp1 = await createAuthUser(admin, 'interpreter');
    interp2 = await createAuthUser(admin, 'interpreter');
    outsider = await createAuthUser(admin, 'interpreter');
    createdUserIds.push(adminUser.id, interp1.id, interp2.id, outsider.id);

    // 2) 테스트 행사 — 오늘부터 7일간 활성
    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        name: '테스트-예약공지',
        start_date: start,
        end_date: endDate,
        status: 'active',
      })
      .select('id')
      .single();
    if (evErr || !ev) throw evErr ?? new Error('event insert failed');
    eventId = ev.id;
    createdEventIds.push(eventId);

    // 3) interpreter 매핑 (outsider 는 매핑 안 함)
    const { error: mapErr } = await admin.from('event_interpreters').insert([
      { event_id: eventId, interpreter_id: interp1.id },
      { event_id: eventId, interpreter_id: interp2.id },
    ]);
    if (mapErr) throw mapErr;
  });

  afterAll(async () => {
    if (!admin) return;
    // events cascade 가 scheduled_notices/notices 까지 청소.
    for (const id of createdEventIds) {
      await admin.from('events').delete().eq('id', id);
    }
    for (const uid of createdUserIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  // ====================================================================
  // create_scheduled_notice
  // ====================================================================
  describe('create_scheduled_notice', () => {
    it('정상: admin 이 미래 시각으로 예약하면 uuid 반환', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { data, error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '점심 안내드립니다.',
        p_scheduled_at: scheduledAt,
        p_recipient_user_ids: [interp1.id, interp2.id],
      });
      expect(error).toBeNull();
      expect(typeof data).toBe('string');
    });

    it('비인증 호출은 unauthenticated 또는 RLS 차단', async () => {
      const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { persistSession: false },
      });
      const { error } = await anon.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      // SECURITY DEFINER 안 raise vs PostgREST anon block 둘 중 하나
      expect(error).not.toBeNull();
      expect(error?.message ?? '').toMatch(/unauthenticated|not_admin|JWT|permission/i);
    });

    it('interpreter 호출은 not_admin', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('not_admin');
    });

    it('과거 시각은 past_schedule', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() - 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('past_schedule');
    });

    it('빈 메시지는 message_empty', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '   ',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('message_empty');
    });

    it('4001자 이상은 message_too_long', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'a'.repeat(4001),
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      // DB CHECK 와 함수 raise 중 먼저 잡히는 쪽. message_too_long 우선.
      expect(error?.message ?? '').toMatch(/message_too_long|check/i);
    });

    it('비활성 행사는 event_inactive', async () => {
      // archived 행사 생성
      const today = new Date().toISOString().slice(0, 10);
      const { data: arch } = await admin
        .from('events')
        .insert({
          name: 'archived',
          start_date: today,
          end_date: today,
          status: 'archived',
        })
        .select('id')
        .single();
      if (!arch) throw new Error('archived event insert failed');
      createdEventIds.push(arch.id);

      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: arch.id,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('event_inactive');
    });

    it('end_date 이후 시각은 event_ended', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      // 행사 end_date 가 오늘+7. KST 기준 8일 뒤로 시도.
      const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: far,
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('event_ended');
    });

    it('KST 경계: end_date 23:59 KST 는 허용, 익일 00:00 KST 는 거부', async () => {
      // 행사 end_date 를 admin 으로 조회
      const { data: ev } = await admin
        .from('events')
        .select('end_date')
        .eq('id', eventId)
        .single();
      const endDate = ev!.end_date as string; // YYYY-MM-DD

      const client = await impersonate(adminUser.email, adminUser.password);

      // end_date 23:59:59 KST = UTC 14:59:59 — 허용
      // KST 는 UTC+9 → '2026-06-22T23:59:59+09:00' 표기
      const okISO = `${endDate}T23:59:59+09:00`;
      const { error: okErr } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '경계 OK',
        p_scheduled_at: okISO,
        p_recipient_user_ids: [interp1.id],
      });
      expect(okErr).toBeNull();

      // 익일 00:00:00 KST = UTC 15:00:00 — 거부
      const nextDay = new Date(`${endDate}T00:00:00+09:00`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const ngISO = nextDay.toISOString().replace('Z', '+00:00');
      const { error: ngErr } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '경계 NG',
        p_scheduled_at: ngISO,
        p_recipient_user_ids: [interp1.id],
      });
      expect(ngErr?.message).toContain('event_ended');
    });

    it('행사에 배정 안 된 통역사 포함 시 recipient_not_interpreter', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id, outsider.id],
      });
      expect(error?.message).toContain('recipient_not_interpreter');
    });

    it('recipient 빈 배열은 recipient_empty', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [],
      });
      expect(error?.message).toContain('recipient_empty');
    });
  });

  // ====================================================================
  // update_scheduled_notice
  // ====================================================================
  describe('update_scheduled_notice', () => {
    let targetId: string;

    beforeAll(async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { data, error } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '수정 전',
        p_scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      if (error || !data) throw error ?? new Error('create failed');
      targetId = data as unknown as string;
    });

    it('정상: 메시지/시각/수신자 변경', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const newAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const { error } = await client.rpc('update_scheduled_notice', {
        p_id: targetId,
        p_message: '수정 후',
        p_scheduled_at: newAt,
        p_recipient_user_ids: [interp1.id, interp2.id],
      });
      expect(error).toBeNull();
    });

    it('interpreter 호출은 not_admin', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { error } = await client.rpc('update_scheduled_notice', {
        p_id: targetId,
        p_message: '해킹',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('not_admin');
    });

    it('이미 cancelled 상태면 not_scheduled', async () => {
      // 새 row 만들고 cancel 후 update 시도
      const client = await impersonate(adminUser.email, adminUser.password);
      const { data: createRes } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '취소 예정',
        p_scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      const cancelId = createRes as unknown as string;

      await client.rpc('cancel_scheduled_notice', { p_id: cancelId });

      const { error } = await client.rpc('update_scheduled_notice', {
        p_id: cancelId,
        p_message: '수정 시도',
        p_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('not_scheduled');
    });

    it('존재하지 않는 id 는 not_scheduled', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.rpc('update_scheduled_notice', {
        p_id: crypto.randomUUID(),
        p_message: 'x',
        p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      expect(error?.message).toContain('not_scheduled');
    });
  });

  // ====================================================================
  // cancel_scheduled_notice
  // ====================================================================
  describe('cancel_scheduled_notice', () => {
    it('정상: scheduled → cancelled', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { data: createRes } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '취소 정상',
        p_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      const id = createRes as unknown as string;

      const { error } = await client.rpc('cancel_scheduled_notice', { p_id: id });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from('scheduled_notices')
        .select('status')
        .eq('id', id)
        .single();
      expect(row?.status).toBe('cancelled');
    });

    it('이미 cancelled 면 not_scheduled', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { data: createRes } = await client.rpc('create_scheduled_notice', {
        p_event_id: eventId,
        p_message: '이중 취소',
        p_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        p_recipient_user_ids: [interp1.id],
      });
      const id = createRes as unknown as string;

      await client.rpc('cancel_scheduled_notice', { p_id: id });
      const { error } = await client.rpc('cancel_scheduled_notice', { p_id: id });
      expect(error?.message).toContain('not_scheduled');
    });

    it('interpreter 호출은 not_admin', async () => {
      const ic = await impersonate(interp1.email, interp1.password);
      const { error } = await ic.rpc('cancel_scheduled_notice', {
        p_id: crypto.randomUUID(),
      });
      expect(error?.message).toContain('not_admin');
    });
  });

  // ====================================================================
  // list_scheduled_notices
  // ====================================================================
  describe('list_scheduled_notices', () => {
    it('정상: admin 이 행사 예약 목록 조회', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { data, error } = await client.rpc('list_scheduled_notices', {
        p_event_id: eventId,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('interpreter 호출은 not_admin', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { error } = await client.rpc('list_scheduled_notices', {
        p_event_id: eventId,
      });
      expect(error?.message).toContain('not_admin');
    });
  });

  // ====================================================================
  // dispatch_due_scheduled_notices + race
  // ====================================================================
  describe('dispatch_due_scheduled_notices', () => {
    it('정상: due row 를 notices INSERT + status=sent 전이', async () => {
      // scheduled_at 을 과거로 강제 (admin 으로 직접 INSERT — RLS 우회)
      const { data: row } = await admin
        .from('scheduled_notices')
        .insert({
          event_id: eventId,
          message: '디스패치 테스트',
          scheduled_at: new Date(Date.now() - 60_000).toISOString(),
          status: 'scheduled',
          recipient_user_ids: [interp1.id, interp2.id],
          created_by: adminUser.id,
        })
        .select('id')
        .single();
      if (!row) throw new Error('insert failed');

      const { data: count, error } = await admin.rpc(
        'dispatch_due_scheduled_notices',
      );
      expect(error).toBeNull();
      expect(typeof count).toBe('number');
      expect((count as unknown as number) >= 1).toBe(true);

      const { data: after } = await admin
        .from('scheduled_notices')
        .select('status, sent_notice_id')
        .eq('id', row.id)
        .single();
      expect(after?.status).toBe('sent');
      expect(after?.sent_notice_id).toBeTruthy();

      // 수신자 RLS 검증 — interp1 으로 본인 공지 조회 가능
      const ic1 = await impersonate(interp1.email, interp1.password);
      const { data: visible1 } = await ic1
        .from('notices')
        .select('id, message, recipient_user_ids')
        .eq('id', after!.sent_notice_id!)
        .maybeSingle();
      expect(visible1?.message).toBe('디스패치 테스트');

      // outsider (행사 미배정 interpreter) 는 못 봐야 함
      const oc = await impersonate(outsider.email, outsider.password);
      const { data: visibleOutsider } = await oc
        .from('notices')
        .select('id')
        .eq('id', after!.sent_notice_id!)
        .maybeSingle();
      expect(visibleOutsider).toBeNull();
    });

    it('빈 큐는 0 반환', async () => {
      // 모든 scheduled row 를 cancelled 로 정리
      await admin
        .from('scheduled_notices')
        .update({ status: 'cancelled' })
        .eq('event_id', eventId)
        .eq('status', 'scheduled');

      const { data: count, error } = await admin.rpc(
        'dispatch_due_scheduled_notices',
      );
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it('동시 update + dispatch race: dispatch 가 잡으면 update 는 not_scheduled', async () => {
      // due row 하나 미리 INSERT
      const { data: row } = await admin
        .from('scheduled_notices')
        .insert({
          event_id: eventId,
          message: 'race',
          scheduled_at: new Date(Date.now() - 60_000).toISOString(),
          status: 'scheduled',
          recipient_user_ids: [interp1.id],
          created_by: adminUser.id,
        })
        .select('id')
        .single();
      if (!row) throw new Error('insert failed');

      // 동시 호출 — Promise.all
      const adminClient = await impersonate(adminUser.email, adminUser.password);
      const [dispatchRes, updateRes] = await Promise.all([
        admin.rpc('dispatch_due_scheduled_notices'),
        adminClient.rpc('update_scheduled_notice', {
          p_id: row.id,
          p_message: 'race 수정 시도',
          p_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          p_recipient_user_ids: [interp1.id],
        }),
      ]);

      // dispatch 든 update 든 반드시 한 쪽은 성공, 한 쪽은 막혀야 함.
      // - dispatch 가 먼저 잡으면 status='sent' → update 는 not_scheduled
      // - update 가 먼저 잡으면 dispatch 는 SKIP LOCKED 으로 건너뜀 (count 0 가능)
      const dispatchOk = !dispatchRes.error;
      const updateOk = !updateRes.error;

      // 두 경로 모두 동시에 성공할 수는 없음 (FOR UPDATE 직렬화 + status 가드).
      // 하지만 dispatch 가 row 를 잡지 않고 SKIP 했고 update 가 성공한 경우는 둘 다 OK.
      // 핵심: update 가 성공했다면 row 가 여전히 scheduled 여야 함.
      const { data: finalRow } = await admin
        .from('scheduled_notices')
        .select('status')
        .eq('id', row.id)
        .single();

      if (updateOk) {
        // dispatch 가 못 잡았거나 잡았지만 update 가 가드를 통과 — 후자는 불가능.
        // 따라서 dispatch 는 이 row 를 SKIP LOCKED 로 건너뛰어야 함 → 다음 tick 에 처리.
        expect(['scheduled']).toContain(finalRow?.status);
      } else {
        // update 가 막혔다면 dispatch 가 잡아서 sent 가 됐어야 함.
        expect(updateRes.error?.message).toContain('not_scheduled');
        expect(['sent']).toContain(finalRow?.status);
      }

      expect(dispatchOk || updateOk).toBe(true);
    });
  });

  // ====================================================================
  // RLS 회귀 — notices.recipient_user_ids NULL = broadcast 보존
  // ====================================================================
  describe('notices RLS — broadcast 회귀', () => {
    it('recipient_user_ids IS NULL 인 broadcast notice 는 target_roles 사용자에게 모두 보인다', async () => {
      // admin 으로 broadcast notice 직접 INSERT (recipient_user_ids 미지정)
      const { data: notice, error: nErr } = await admin
        .from('notices')
        .insert({
          event_id: eventId,
          message: '브로드캐스트 회귀 검증',
          target_roles: ['interpreter'],
          sent_by: adminUser.id,
        })
        .select('id')
        .single();
      if (nErr || !notice) throw nErr ?? new Error('notice insert failed');

      // 행사에 배정된 interpreter 둘 다 보여야 함
      const ic1 = await impersonate(interp1.email, interp1.password);
      const { data: r1 } = await ic1
        .from('notices')
        .select('id')
        .eq('id', notice.id)
        .maybeSingle();
      expect(r1?.id).toBe(notice.id);

      const ic2 = await impersonate(interp2.email, interp2.password);
      const { data: r2 } = await ic2
        .from('notices')
        .select('id')
        .eq('id', notice.id)
        .maybeSingle();
      expect(r2?.id).toBe(notice.id);

      // outsider (interpreter role) 도 target_roles=interpreter 라서 broadcast 보임.
      // (마이그 022 정책의 의도된 동작 — event 매핑은 보지 않음)
      const oc = await impersonate(outsider.email, outsider.password);
      const { data: r3 } = await oc
        .from('notices')
        .select('id')
        .eq('id', notice.id)
        .maybeSingle();
      expect(r3?.id).toBe(notice.id);
    });

    it('recipient_user_ids 가 NOT NULL 이면 그 user 만 본다', async () => {
      const { data: notice, error: nErr } = await admin
        .from('notices')
        .insert({
          event_id: eventId,
          message: '부분집합 검증',
          target_roles: ['interpreter'],
          recipient_user_ids: [interp1.id],
          sent_by: adminUser.id,
        })
        .select('id')
        .single();
      if (nErr || !notice) throw nErr ?? new Error('notice insert failed');

      const ic1 = await impersonate(interp1.email, interp1.password);
      const { data: r1 } = await ic1
        .from('notices')
        .select('id')
        .eq('id', notice.id)
        .maybeSingle();
      expect(r1?.id).toBe(notice.id);

      const ic2 = await impersonate(interp2.email, interp2.password);
      const { data: r2 } = await ic2
        .from('notices')
        .select('id')
        .eq('id', notice.id)
        .maybeSingle();
      expect(r2).toBeNull();
    });
  });
});
