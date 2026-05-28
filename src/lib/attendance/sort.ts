// 출석표 정렬 비교 팩토리.
//
// page.tsx 의 sort 로직을 추출. tie-breaker 는 항상 이름 오름차순(ko locale).
// STATUS_ORDER / EVAL_ORDER 도 함께 보관 — 필터 드롭다운에서도 동일 순서 사용.

export type AttendanceStatus =
  | 'NONE'
  | 'WAITING'
  | 'COMING'
  | 'ABSENT'
  | 'IN_CONSULT'
  | 'DONE'
  | 'LEAVE_OK'
  | 'LEAVE';

export type EvalKey = 'NORMAL' | 'ABSENT' | 'LATE' | 'UNAUTHORIZED' | 'OTHER';
export type EvalType = EvalKey | null;

export type AttendanceSortBy = 'name' | 'status' | 'eval';

export interface AttendanceSortItem {
  user: { name: string };
  status: AttendanceStatus;
  eval: EvalType;
}

export const STATUS_ORDER: readonly AttendanceStatus[] = [
  'NONE',
  'WAITING',
  'COMING',
  'ABSENT',
  'IN_CONSULT',
  'DONE',
  'LEAVE_OK',
  'LEAVE',
] as const;

export const EVAL_ORDER: readonly EvalKey[] = [
  'NORMAL',
  'LATE',
  'ABSENT',
  'UNAUTHORIZED',
  'OTHER',
] as const;

function byName(a: AttendanceSortItem, b: AttendanceSortItem): number {
  return a.user.name.localeCompare(b.user.name, 'ko');
}

export function compareAttendance(
  sortBy: AttendanceSortBy,
): (a: AttendanceSortItem, b: AttendanceSortItem) => number {
  if (sortBy === 'name') return byName;

  if (sortBy === 'status') {
    return (a, b) => {
      const diff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      return diff !== 0 ? diff : byName(a, b);
    };
  }

  // sortBy === 'eval' — null 은 항상 후순위(99). EVAL_ORDER 에 누락된 키는 98(=마지막 직전).
  return (a, b) => {
    const idxA = evalIndex(a.eval);
    const idxB = evalIndex(b.eval);
    return idxA !== idxB ? idxA - idxB : byName(a, b);
  };
}

function evalIndex(key: EvalType): number {
  if (key === null) return 99;
  const idx = EVAL_ORDER.indexOf(key);
  return idx < 0 ? 98 : idx;
}
