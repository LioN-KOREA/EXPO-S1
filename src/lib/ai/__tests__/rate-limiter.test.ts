import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_USD_CAP,
  PER_MINUTE_CAP,
  checkDailyCap,
  checkLimits,
  checkMinuteCap,
  kstTodayBoundsUtc,
} from '@/lib/ai/rate-limiter';

type SelectMock = ReturnType<typeof vi.fn>;

// 분당 카운트 mock supabase
function mockCountSupabase(count: number | null, error: null | { message: string } = null) {
  const finalChain: SelectMock = vi.fn().mockResolvedValue({ count, error });
  const gte = vi.fn().mockReturnValue({ then: undefined, ...finalChain.mock, ...{ }, gte: vi.fn() });
  // 체인을 단순화: select() → eq().eq().gte() 가 await 가능해야 함.
  const chain = {
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    then: undefined,
  } as Record<string, unknown>;
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  // 마지막 await: chain 자체에 then 을 달거나 select 가 PromiseLike 를 반환해야.
  // 간단히: 마지막 gte / lt 호출이 Promise 반환하도록 변경.
  chain.gte = vi.fn().mockResolvedValue({ count, error });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(chain),
    }),
  };
}

// SUM 용 mock supabase (data 배열 반환)
function mockSumSupabase(rows: Array<{ cost_usd: number | null }>, error: null | { message: string } = null) {
  const chain = {
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
  } as Record<string, unknown>;
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockResolvedValue({ data: rows, error });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(chain),
    }),
  };
}

describe('constants', () => {
  it('PER_MINUTE_CAP = 10', () => expect(PER_MINUTE_CAP).toBe(10));
  it('DAILY_USD_CAP = 10', () => expect(DAILY_USD_CAP).toBe(10));
});

describe('kstTodayBoundsUtc', () => {
  it('KST 2026-06-09 00:00 = UTC 2026-06-08 15:00', () => {
    // 2026-06-09 12:00 KST → UTC 03:00
    const noonKstAsUtc = new Date('2026-06-09T03:00:00Z');
    const { startIso, endIso } = kstTodayBoundsUtc(noonKstAsUtc);
    expect(startIso).toBe('2026-06-08T15:00:00.000Z');
    expect(endIso).toBe('2026-06-09T15:00:00.000Z');
  });

  it('KST 자정 직전도 같은 날 경계 반환', () => {
    // 2026-06-09 23:59 KST → UTC 14:59
    const lateKstAsUtc = new Date('2026-06-09T14:59:00Z');
    const { startIso, endIso } = kstTodayBoundsUtc(lateKstAsUtc);
    expect(startIso).toBe('2026-06-08T15:00:00.000Z');
    expect(endIso).toBe('2026-06-09T15:00:00.000Z');
  });
});

describe('checkMinuteCap', () => {
  it('0건 → allowed', async () => {
    const sb = mockCountSupabase(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkMinuteCap(sb as any, 'user1');
    expect(out.allowed).toBe(true);
  });

  it('9건 (경계 미만) → allowed', async () => {
    const sb = mockCountSupabase(9);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkMinuteCap(sb as any, 'user1');
    expect(out.allowed).toBe(true);
  });

  it('10건 (경계) → blocked minute_cap', async () => {
    const sb = mockCountSupabase(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkMinuteCap(sb as any, 'user1');
    expect(out.allowed).toBe(false);
    if (!out.allowed) {
      expect(out.reason).toBe('minute_cap');
      expect(out.currentCount).toBe(10);
    }
  });

  it('DB 오류 → allowed (안전망)', async () => {
    const sb = mockCountSupabase(null, { message: 'connection lost' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkMinuteCap(sb as any, 'user1');
    expect(out.allowed).toBe(true);
  });
});

describe('checkDailyCap', () => {
  it('$0 → allowed', async () => {
    const sb = mockSumSupabase([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkDailyCap(sb as any, 'event1');
    expect(out.allowed).toBe(true);
  });

  it('$9.99 → allowed', async () => {
    const sb = mockSumSupabase([{ cost_usd: 9.99 }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkDailyCap(sb as any, 'event1');
    expect(out.allowed).toBe(true);
  });

  it('$10 (경계) → blocked daily_cap', async () => {
    const sb = mockSumSupabase([{ cost_usd: 5 }, { cost_usd: 5 }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkDailyCap(sb as any, 'event1');
    expect(out.allowed).toBe(false);
    if (!out.allowed) {
      expect(out.reason).toBe('daily_cap');
      expect(out.currentCostUsd).toBe(10);
    }
  });

  it('$10.01 → blocked', async () => {
    const sb = mockSumSupabase([{ cost_usd: 10.01 }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkDailyCap(sb as any, 'event1');
    expect(out.allowed).toBe(false);
  });

  it('null cost 무시', async () => {
    const sb = mockSumSupabase([{ cost_usd: null }, { cost_usd: 3 }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkDailyCap(sb as any, 'event1');
    expect(out.allowed).toBe(true);
  });
});

describe('checkLimits 통합', () => {
  it('분당 통과 + 일일 통과 → allowed', async () => {
    // 두 번 from 호출 — 각 호출이 다른 chain 반환 필요.
    let call = 0;
    const sb = {
      from: vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) {
          const chain = { eq: vi.fn(), gte: vi.fn() } as Record<string, unknown>;
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.gte = vi.fn().mockResolvedValue({ count: 3, error: null });
          return { select: vi.fn().mockReturnValue(chain) };
        }
        const chain = { eq: vi.fn(), gte: vi.fn(), lt: vi.fn() } as Record<string, unknown>;
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.lt = vi.fn().mockResolvedValue({ data: [{ cost_usd: 2 }], error: null });
        return { select: vi.fn().mockReturnValue(chain) };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkLimits(sb as any, { userId: 'u1', eventId: 'e1' });
    expect(out.allowed).toBe(true);
  });

  it('분당 차단 시 일일은 검사 X', async () => {
    let call = 0;
    const sb = {
      from: vi.fn().mockImplementation(() => {
        call++;
        const chain = { eq: vi.fn(), gte: vi.fn() } as Record<string, unknown>;
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockResolvedValue({ count: 99, error: null });
        return { select: vi.fn().mockReturnValue(chain) };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await checkLimits(sb as any, { userId: 'u1', eventId: 'e1' });
    expect(out.allowed).toBe(false);
    expect(call).toBe(1);
  });
});
