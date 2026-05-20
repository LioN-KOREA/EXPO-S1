// 이벤트 종료 발송 차단 판정 (순수 함수). 도메인 공용.
// end_date 는 'YYYY-MM-DD' 또는 ISO 형식. 'YYYY-MM-DD' 면 지정 timezone 자정 기준.
// 기본 timezone = 'Asia/Seoul' (현재 단일 국가). 글로벌 확장 시 timezone 명시.

export interface EventLike {
  end_date?: string | null;
}

const KST_OFFSET = '+09:00';

// timezone 문자열 → 표준 offset. 단순 매핑 — 정확한 IANA 처리는 Intl.DateTimeFormat 필요.
function offsetForTimezone(tz: string): string {
  if (tz === 'Asia/Seoul' || tz === 'KST') return '+09:00';
  if (tz === 'UTC') return '+00:00';
  // ISO offset 직접 (예: '+05:30') 도 허용
  if (/^[+-]\d{2}:\d{2}$/.test(tz)) return tz;
  return KST_OFFSET;
}

export function isEventClosed(
  event: EventLike | null | undefined,
  timezone: string = 'Asia/Seoul'
): boolean {
  if (!event || !event.end_date) return false;
  const endStr = event.end_date.length === 10
    ? `${event.end_date}T23:59:59${offsetForTimezone(timezone)}`
    : event.end_date;
  const endMs = Date.parse(endStr);
  if (Number.isNaN(endMs)) return false;
  return Date.now() > endMs;
}
