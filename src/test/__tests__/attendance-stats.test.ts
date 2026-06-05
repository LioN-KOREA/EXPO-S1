// PRD #17 S0 — getAttendanceStats 단위 테스트.
// Supabase 쿼리 빌더를 fluent mock 으로 대체하여 외부 동작만 검증.

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttendanceStats, todayKST } from '@/lib/attendance/stats';

type Row = { status: string; date: string };

interface MockFixture {
  event: { start_date: string; end_date: string } | null;
  rows: Row[];
}

function makeClient(fixture: MockFixture): {
  client: SupabaseClient;
  attendanceFilters: { date?: string; gte?: string; lte?: string };
} {
  const attendanceFilters: { date?: string; gte?: string; lte?: string } = {};

  const from = vi.fn((table: string) => {
    if (table === 'events') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: fixture.event, error: null }),
      };
    }
    if (table === 'attendances') {
      const chain: Record<string, unknown> = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        then: (resolve: (r: { data: Row[]; error: null }) => void) =>
          resolve({ data: fixture.rows, error: null }),
      };
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === 'date') attendanceFilters.date = val;
        return chain;
      });
      chain.gte = vi.fn((_col: string, val: string) => {
        attendanceFilters.gte = val;
        return chain;
      });
      chain.lte = vi.fn((_col: string, val: string) => {
        attendanceFilters.lte = val;
        return chain;
      });
      return chain;
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    attendanceFilters,
  };
}

describe('getAttendanceStats', () => {
  describe('today scope', () => {
    it('8개 status 한 행씩 → numerator=6, denominator=8, absent=1, none=1', async () => {
      const rows: Row[] = [
        { status: 'NONE', date: '2026-06-05' },
        { status: 'WAITING', date: '2026-06-05' },
        { status: 'COMING', date: '2026-06-05' },
        { status: 'ABSENT', date: '2026-06-05' },
        { status: 'IN_CONSULT', date: '2026-06-05' },
        { status: 'DONE', date: '2026-06-05' },
        { status: 'LEAVE_OK', date: '2026-06-05' },
        { status: 'LEAVE', date: '2026-06-05' },
      ];
      const { client } = makeClient({
        event: { start_date: '2026-06-04', end_date: '2026-06-06' },
        rows,
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats).toEqual({
        numerator: 6,
        denominator: 8,
        absent: 1,
        none: 1,
        outOfRange: false,
      });
    });

    it('today < start_date → outOfRange=true, 카운트 0', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-10', end_date: '2026-06-12' },
        rows: [],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats.outOfRange).toBe(true);
      expect(stats.numerator).toBe(0);
      expect(stats.denominator).toBe(0);
    });

    it('today > end_date → outOfRange=true', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-05-01', end_date: '2026-05-03' },
        rows: [],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats.outOfRange).toBe(true);
    });

    it('today=start_date 경계 = 행사 기간 내, outOfRange=false', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-05', end_date: '2026-06-07' },
        rows: [{ status: 'WAITING', date: '2026-06-05' }],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats.outOfRange).toBe(false);
      expect(stats.numerator).toBe(1);
      expect(stats.denominator).toBe(1);
    });

    it('today=end_date 경계도 행사 기간 내', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-01', end_date: '2026-06-05' },
        rows: [{ status: 'DONE', date: '2026-06-05' }],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats.outOfRange).toBe(false);
      expect(stats.numerator).toBe(1);
    });

    it('rows 0건 = 출석표 미생성 → 0/0, outOfRange=false', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-01', end_date: '2026-06-10' },
        rows: [],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats).toEqual({
        numerator: 0,
        denominator: 0,
        absent: 0,
        none: 0,
        outOfRange: false,
      });
    });
  });

  describe('all scope', () => {
    it('행사 기간 전체 누적 — 분자/분모/결근/미체크 합산', async () => {
      const rows: Row[] = [
        { status: 'WAITING', date: '2026-06-01' },
        { status: 'DONE', date: '2026-06-02' },
        { status: 'ABSENT', date: '2026-06-01' },
        { status: 'NONE', date: '2026-06-02' },
        { status: 'LEAVE', date: '2026-06-03' },
      ];
      const { client } = makeClient({
        event: { start_date: '2026-06-01', end_date: '2026-06-03' },
        rows,
      });
      const stats = await getAttendanceStats(client, { eventId: 'e1', scope: 'all' });
      expect(stats).toEqual({
        numerator: 3,
        denominator: 5,
        absent: 1,
        none: 1,
        outOfRange: false,
      });
    });

    it('all scope = today 인자 무관 (outOfRange 평가 안 함)', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-01', end_date: '2026-06-03' },
        rows: [{ status: 'WAITING', date: '2026-06-02' }],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'all',
        today: '2030-01-01',
      });
      expect(stats.outOfRange).toBe(false);
      expect(stats.numerator).toBe(1);
    });
  });

  describe('event 미존재', () => {
    it('events row 없으면 outOfRange=true + 카운트 0', async () => {
      const { client } = makeClient({ event: null, rows: [] });
      const stats = await getAttendanceStats(client, {
        eventId: 'missing',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats).toEqual({
        numerator: 0,
        denominator: 0,
        absent: 0,
        none: 0,
        outOfRange: true,
      });
    });
  });

  describe('알 수 없는 status', () => {
    it('정의 외 status 는 분자/결근/미체크 어디에도 미포함 — 분모에만 카운트', async () => {
      const { client } = makeClient({
        event: { start_date: '2026-06-01', end_date: '2026-06-10' },
        rows: [
          { status: 'WAITING', date: '2026-06-05' },
          { status: 'UNKNOWN_NEW_VALUE', date: '2026-06-05' },
        ],
      });
      const stats = await getAttendanceStats(client, {
        eventId: 'e1',
        scope: 'today',
        today: '2026-06-05',
      });
      expect(stats.numerator).toBe(1);
      expect(stats.absent).toBe(0);
      expect(stats.none).toBe(0);
      expect(stats.denominator).toBe(2);
    });
  });

  describe('todayKST', () => {
    it('Date(UTC) → KST YYYY-MM-DD', () => {
      // 2026-06-05 23:59:00 UTC = 2026-06-06 08:59 KST.
      const d = new Date('2026-06-05T23:59:00.000Z');
      expect(todayKST(d)).toBe('2026-06-06');
    });

    it('자정 직후 UTC 도 KST 기준으로 +9h 적용', () => {
      // 2026-06-05 00:00:00 UTC = 2026-06-05 09:00 KST.
      const d = new Date('2026-06-05T00:00:00.000Z');
      expect(todayKST(d)).toBe('2026-06-05');
    });
  });
});
