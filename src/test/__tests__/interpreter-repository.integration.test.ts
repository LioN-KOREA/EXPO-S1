/**
 * interpreter repository 통합 테스트 — PRD #16 / 슬라이스 S0.
 *
 * 정책: 로컬 supabase 미기동 시 skip (scheduled-notice-rpc.integration 패턴 동일).
 *
 * 검증 범위:
 * - 마이그 044 의 실제 DB 동작 (column REVOKE / RLS / RPC enum / UNIQUE)
 * - repository 4 함수 외부 행동 (list 필터/검색, history join, upsert UNIQUE, RPC)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getInterpreterWithHistory,
  listInterpreters,
  updateGlobalFields,
  upsertEvaluation,
} from '@/lib/interpreter/repository';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  describe('interpreter repository (integration)', () => {
    it.skip('로컬 supabase 미기동 — skip', () => {});
  });
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@excon.test`;
}

async function createAuthUser(
  admin: SupabaseClient,
  role: 'admin' | 'interpreter',
): Promise<{ id: string; email: string; password: string }> {
  const email = uniqueEmail(`interp-test-${role}`);
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
    name: `테스트-${role}-${Math.random().toString(36).slice(2, 6)}`,
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

describeIntegration('interpreter repository (integration)', () => {
  let admin: SupabaseClient;
  let adminUser: { id: string; email: string; password: string };
  let interp1: { id: string; email: string; password: string };
  let interp2: { id: string; email: string; password: string };
  let unassigned: { id: string; email: string; password: string };
  let event1Id: string;
  let event2Id: string;
  const createdUserIds: string[] = [];
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    adminUser = await createAuthUser(admin, 'admin');
    interp1 = await createAuthUser(admin, 'interpreter');
    interp2 = await createAuthUser(admin, 'interpreter');
    unassigned = await createAuthUser(admin, 'interpreter');
    createdUserIds.push(adminUser.id, interp1.id, interp2.id, unassigned.id);

    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // event1 = 최근
    const { data: ev1, error: e1 } = await admin
      .from('events')
      .insert({
        name: '테스트-통역사관리-1',
        start_date: fmt(today),
        end_date: fmt(new Date(today.getTime() + 2 * 86400_000)),
        status: 'active',
      })
      .select('id')
      .single();
    if (e1 || !ev1) throw e1 ?? new Error('event1 insert failed');
    event1Id = ev1.id;
    createdEventIds.push(event1Id);

    // event2 = 한 달 전 (장기 history)
    const past = new Date(today.getTime() - 30 * 86400_000);
    const { data: ev2, error: e2 } = await admin
      .from('events')
      .insert({
        name: '테스트-통역사관리-2',
        start_date: fmt(past),
        end_date: fmt(new Date(past.getTime() + 2 * 86400_000)),
        status: 'active',
      })
      .select('id')
      .single();
    if (e2 || !ev2) throw e2 ?? new Error('event2 insert failed');
    event2Id = ev2.id;
    createdEventIds.push(event2Id);

    // interp1 = event1 + event2 배정
    // interp2 = event1 만 배정
    // unassigned = 어떤 이벤트에도 미배정
    await admin.from('event_interpreters').insert([
      { event_id: event1Id, interpreter_id: interp1.id },
      { event_id: event2Id, interpreter_id: interp1.id },
      { event_id: event1Id, interpreter_id: interp2.id },
    ]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdEventIds) {
      await admin.from('events').delete().eq('id', id);
    }
    for (const uid of createdUserIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  // ============================================================
  // interpreter_global_meta RLS — admin only (PRD US18)
  // ============================================================
  describe('interpreter_global_meta RLS', () => {
    it('통역사 본인 client 는 자기 meta row SELECT 시도해도 RLS 차단 (빈 결과)', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { data, error } = await client
        .from('interpreter_global_meta')
        .select('*')
        .eq('interpreter_id', interp1.id);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });

    it('admin client 는 meta SELECT 통과', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.from('interpreter_global_meta').select('*');
      expect(error).toBeNull();
    });

    it('통역사 client 가 meta INSERT 시도 → RLS 거부', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { error } = await client
        .from('interpreter_global_meta')
        .insert({ interpreter_id: interp1.id, grade: '특급' });
      expect(error).not.toBeNull();
    });
  });

  // ============================================================
  // interpreter_evaluations RLS — admin only
  // ============================================================
  describe('interpreter_evaluations RLS', () => {
    it('통역사 client 는 SELECT 거부 (RLS)', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { data, error } = await client.from('interpreter_evaluations').select('id');
      // RLS — admin 외에는 빈 결과 또는 거부
      expect((data ?? []).length).toBe(0);
      expect(error).toBeNull(); // RLS 차단은 보통 에러 X, 빈 row
    });

    it('admin client 는 SELECT 통과', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      const { error } = await client.from('interpreter_evaluations').select('id');
      expect(error).toBeNull();
    });

    it('통역사 client 가 INSERT 시도 → RLS 거부', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      const { error } = await client.from('interpreter_evaluations').insert({
        interpreter_id: interp1.id,
        event_id: event1Id,
        evaluated_by: interp1.id,
      });
      expect(error).not.toBeNull();
    });
  });

  // ============================================================
  // upsertEvaluation
  // ============================================================
  describe('upsertEvaluation', () => {
    it('통역사 미배정 이벤트 → interpreter_not_assigned_to_event', async () => {
      await expect(
        upsertEvaluation(admin, {
          interpreterId: unassigned.id,
          eventId: event1Id,
          comment: '테스트',
          notes: null,
          paidRate: null,
          evaluatedBy: adminUser.id,
        }),
      ).rejects.toThrow('interpreter_not_assigned_to_event');
    });

    it('정상 insert', async () => {
      const result = await upsertEvaluation(admin, {
        interpreterId: interp1.id,
        eventId: event1Id,
        comment: '시간 엄수 정확',
        notes: '특이사항 없음',
        paidRate: 350000,
        evaluatedBy: adminUser.id,
      });
      expect(result.interpreter_id).toBe(interp1.id);
      expect(result.event_id).toBe(event1Id);
      expect(result.comment).toBe('시간 엄수 정확');
      expect(Number(result.paid_rate)).toBe(350000);
    });

    it('UNIQUE 충돌 → upsert 가 같은 row 갱신', async () => {
      const updated = await upsertEvaluation(admin, {
        interpreterId: interp1.id,
        eventId: event1Id,
        comment: '갱신됨',
        notes: null,
        paidRate: 400000,
        evaluatedBy: adminUser.id,
      });
      expect(updated.comment).toBe('갱신됨');
      expect(Number(updated.paid_rate)).toBe(400000);
    });
  });

  // ============================================================
  // updateGlobalFields RPC
  // ============================================================
  describe('updateGlobalFields (RPC)', () => {
    it('admin RPC → interpreter_global_meta upsert 성공', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      await updateGlobalFields(client, interp1.id, {
        grade: '특급',
        baseRate: 500000,
        rehireStatus: '가능',
        globalNotes: '베테랑',
      });
      const { data } = await admin
        .from('interpreter_global_meta')
        .select('grade, base_rate, rehire_status, global_notes')
        .eq('interpreter_id', interp1.id)
        .single();
      expect(data?.grade).toBe('특급');
      expect(Number(data?.base_rate)).toBe(500000);
      expect(data?.rehire_status).toBe('가능');
      expect(data?.global_notes).toBe('베테랑');
    });

    it('통역사 RPC 호출 → forbidden_not_admin (42501)', async () => {
      const client = await impersonate(interp1.email, interp1.password);
      await expect(
        updateGlobalFields(client, interp1.id, {
          grade: '우수',
          baseRate: null,
          rehireStatus: null,
          globalNotes: null,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/forbidden_not_admin/) });
    });

    it('admin → 잘못된 enum grade → invalid_grade', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      await expect(
        updateGlobalFields(client, interp1.id, {
          grade: 'S' as never,
          baseRate: null,
          rehireStatus: null,
          globalNotes: null,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/invalid_grade/) });
    });

    it('admin → 잘못된 enum rehire_status → invalid_rehire_status', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      await expect(
        updateGlobalFields(client, interp1.id, {
          grade: null,
          baseRate: null,
          rehireStatus: 'maybe' as never,
          globalNotes: null,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/invalid_rehire_status/) });
    });

    it('admin → 음수 base_rate → invalid_base_rate', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      await expect(
        updateGlobalFields(client, interp1.id, {
          grade: null,
          baseRate: -100,
          rehireStatus: null,
          globalNotes: null,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/invalid_base_rate/) });
    });

    it('admin → 비 interpreter 대상 → target_not_interpreter', async () => {
      const client = await impersonate(adminUser.email, adminUser.password);
      await expect(
        updateGlobalFields(client, adminUser.id, {
          grade: '특급',
          baseRate: null,
          rehireStatus: null,
          globalNotes: null,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/target_not_interpreter/) });
    });
  });

  // ============================================================
  // listInterpreters
  // ============================================================
  describe('listInterpreters', () => {
    it('전체 통역사 + 이벤트 칩 + 평가 카운트', async () => {
      const items = await listInterpreters(admin);
      const interp1Item = items.find((i) => i.profile.id === interp1.id);
      const interp2Item = items.find((i) => i.profile.id === interp2.id);

      expect(interp1Item).toBeDefined();
      expect(interp1Item?.events.length).toBe(2);
      // 최근순 정렬
      const ev0 = interp1Item?.events[0]?.start_date ?? '';
      const ev1 = interp1Item?.events[1]?.start_date ?? '';
      expect(ev0 >= ev1).toBe(true);
      expect(interp1Item?.evaluation_count).toBeGreaterThanOrEqual(1);

      expect(interp2Item?.events.length).toBe(1);
      expect(interp2Item?.evaluation_count).toBe(0);
    });

    it('gradeFilter = 특급 → interp1 만 (이전 RPC 에서 meta.grade=특급 세팅됨)', async () => {
      const items = await listInterpreters(admin, { gradeFilter: '특급' });
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const i of items) {
        expect(i.meta?.grade).toBe('특급');
      }
    });

    it('search = 이메일 일부', async () => {
      const term = interp1.email.split('@')[0].slice(0, 8);
      const items = await listInterpreters(admin, { search: term });
      expect(items.find((i) => i.profile.id === interp1.id)).toBeDefined();
    });
  });

  // ============================================================
  // getInterpreterWithHistory
  // ============================================================
  describe('getInterpreterWithHistory', () => {
    it('interp1 → 프로필 + 2 이벤트 + 평가 1+', async () => {
      const result = await getInterpreterWithHistory(admin, interp1.id);
      expect(result).not.toBeNull();
      expect(result?.profile.id).toBe(interp1.id);
      expect(result?.events.length).toBe(2);
      expect(result?.evaluations.length).toBeGreaterThanOrEqual(1);
    });

    it('비-interpreter id → null', async () => {
      const result = await getInterpreterWithHistory(admin, adminUser.id);
      expect(result).toBeNull();
    });
  });
});
