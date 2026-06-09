import { describe, expect, it } from 'vitest';
import { clampIndex, CONTEXT_HASH, POOL_SIZE_CAP } from '@/lib/ai/pool-manager';

describe('clampIndex', () => {
  it('정상 범위 0..4 유지', () => {
    for (let i = 0; i < POOL_SIZE_CAP; i++) {
      expect(clampIndex(i)).toBe(i);
    }
  });

  it('5 → 0 (wrap)', () => {
    expect(clampIndex(5)).toBe(0);
  });

  it('6 → 1, 7 → 2', () => {
    expect(clampIndex(6)).toBe(1);
    expect(clampIndex(7)).toBe(2);
  });

  it('10 → 0', () => {
    expect(clampIndex(10)).toBe(0);
  });

  it('음수 → 0', () => {
    expect(clampIndex(-1)).toBe(0);
    expect(clampIndex(-100)).toBe(0);
  });

  it('분수 floor', () => {
    expect(clampIndex(2.7)).toBe(2);
    expect(clampIndex(4.99)).toBe(4);
  });

  it('NaN/Infinity → 0', () => {
    expect(clampIndex(NaN)).toBe(0);
    expect(clampIndex(Infinity)).toBe(0);
    expect(clampIndex(-Infinity)).toBe(0);
  });
});

describe('constants', () => {
  it('CONTEXT_HASH = "v1"', () => {
    expect(CONTEXT_HASH).toBe('v1');
  });
  it('POOL_SIZE_CAP = 5', () => {
    expect(POOL_SIZE_CAP).toBe(5);
  });
});
