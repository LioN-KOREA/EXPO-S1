import { describe, it, expect } from 'vitest';
import {
  compareAttendance,
  type AttendanceSortItem,
} from '@/lib/attendance/sort';

function row(
  name: string,
  status: AttendanceSortItem['status'],
  evalKey: AttendanceSortItem['eval'],
): AttendanceSortItem {
  return { user: { name }, status, eval: evalKey };
}

describe('compareAttendance', () => {
  it('name: 한글 가나다순', () => {
    const items = [row('박셋', 'NONE', null), row('김첫', 'NONE', null), row('이둘', 'NONE', null)];
    const sorted = [...items].sort(compareAttendance('name'));
    expect(sorted.map(i => i.user.name)).toEqual(['김첫', '박셋', '이둘']);
  });

  it('status: STATUS_ORDER 순 + 이름 tie-breaker', () => {
    const items = [
      row('나', 'DONE', null),
      row('가', 'DONE', null),
      row('다', 'WAITING', null),
    ];
    const sorted = [...items].sort(compareAttendance('status'));
    expect(sorted.map(i => `${i.status}:${i.user.name}`)).toEqual([
      'WAITING:다',
      'DONE:가',
      'DONE:나',
    ]);
  });

  it('eval: null 은 후순위, NORMAL→LATE→ABSENT→UNAUTHORIZED→OTHER', () => {
    const items = [
      row('a', 'NONE', 'OTHER'),
      row('b', 'NONE', null),
      row('c', 'NONE', 'NORMAL'),
      row('d', 'NONE', 'LATE'),
      row('e', 'NONE', 'ABSENT'),
      row('f', 'NONE', 'UNAUTHORIZED'),
    ];
    const sorted = [...items].sort(compareAttendance('eval'));
    expect(sorted.map(i => i.user.name)).toEqual(['c', 'd', 'e', 'f', 'a', 'b']);
  });

  it('eval: 같은 eval 은 이름 tie-breaker', () => {
    const items = [
      row('나', 'NONE', 'NORMAL'),
      row('가', 'NONE', 'NORMAL'),
    ];
    const sorted = [...items].sort(compareAttendance('eval'));
    expect(sorted.map(i => i.user.name)).toEqual(['가', '나']);
  });
});
