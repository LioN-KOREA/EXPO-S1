// 이벤트 종료 발송 차단 판정 (순수 함수). 도메인 공용.
// notice, template, messenger 등 이벤트에 묶인 모든 도메인에서 재사용 가능.
//
// end_date 는 'YYYY-MM-DD' 또는 ISO 형식. 종료일 KST 자정 지나면 차단.

export interface EventLike {
  end_date?: string | null;
}

export function isEventClosed(event: EventLike | null | undefined): boolean {
  if (!event || !event.end_date) return false;
  const endStr = event.end_date.length === 10 ? `${event.end_date}T23:59:59+09:00` : event.end_date;
  const endMs = Date.parse(endStr);
  if (Number.isNaN(endMs)) return false;
  return Date.now() > endMs;
}
