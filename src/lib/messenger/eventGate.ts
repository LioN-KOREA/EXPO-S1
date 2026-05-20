// 이벤트 종료 발송 차단 판정 (순수 함수).
// end_date 는 'YYYY-MM-DD' 또는 ISO 형식. 종료일 지난 다음 날부터 차단.

export interface EventLike {
  end_date?: string | null;
  // 다른 컬럼 무관
}

export function isEventClosed(event: EventLike | null | undefined): boolean {
  if (!event || !event.end_date) return false;
  // 종료일을 KST 자정으로 정규화. UTC 비교는 시차로 잘못된 판정 가능.
  // end_date 가 'YYYY-MM-DD' 면 자정으로 간주.
  const endStr = event.end_date.length === 10 ? `${event.end_date}T23:59:59+09:00` : event.end_date;
  const endMs = Date.parse(endStr);
  if (Number.isNaN(endMs)) return false;
  return Date.now() > endMs;
}
