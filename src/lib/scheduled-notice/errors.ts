// 마이그 040 RPC 들이 던지는 영문 키워드 → 사용자 메시지 매핑.
// repository 는 ScheduledNoticeError 로 정규화해서 던지고, UI 측에서 i18n 적용.

export const SCHEDULED_NOTICE_ERROR_CODES = [
  'unauthenticated',
  'not_admin',
  'message_empty',
  'message_too_long',
  'past_schedule',
  'recipient_empty',
  'event_inactive',
  'event_ended',
  'recipient_not_interpreter',
  'not_scheduled',
  'unknown',
] as const;

export type ScheduledNoticeErrorCode =
  (typeof SCHEDULED_NOTICE_ERROR_CODES)[number];

export class ScheduledNoticeError extends Error {
  readonly code: ScheduledNoticeErrorCode;
  constructor(code: ScheduledNoticeErrorCode, rawMessage?: string) {
    super(rawMessage ?? code);
    this.code = code;
    this.name = 'ScheduledNoticeError';
  }
}

export function mapRpcError(rawMessage: string | undefined | null): ScheduledNoticeError {
  if (!rawMessage) return new ScheduledNoticeError('unknown');
  // supabase-js 의 PostgrestError.message 는 RAISE EXCEPTION 의 첫 인자 그대로 들어옴.
  // 키워드 단어 경계로만 매칭 — substring false positive 차단 (예: 'not_administered' ≠ 'not_admin').
  for (const code of SCHEDULED_NOTICE_ERROR_CODES) {
    if (code === 'unknown') continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${code}([^A-Za-z0-9_]|$)`);
    if (pattern.test(rawMessage)) {
      return new ScheduledNoticeError(code, rawMessage);
    }
  }
  return new ScheduledNoticeError('unknown', rawMessage);
}

const KO_MAP: Record<ScheduledNoticeErrorCode, string> = {
  unauthenticated: '로그인이 필요합니다',
  not_admin: '관리자 권한이 필요합니다',
  message_empty: '메시지를 입력하세요',
  message_too_long: '메시지는 4000자 이내로 입력하세요',
  past_schedule: '과거 시각으로 예약할 수 없습니다',
  recipient_empty: '대상자가 1명 이상이어야 합니다',
  event_inactive: '활성 상태인 행사가 아닙니다',
  event_ended: '행사 종료일 이후로는 예약할 수 없습니다',
  recipient_not_interpreter: '대상자 중 해당 행사 통역사가 아닌 사용자가 있습니다',
  not_scheduled: '이미 발송되었거나 취소된 예약입니다',
  unknown: '오류가 발생했습니다',
};

const EN_MAP: Record<ScheduledNoticeErrorCode, string> = {
  unauthenticated: 'Login required',
  not_admin: 'Admin permission required',
  message_empty: 'Please enter a message',
  message_too_long: 'Message must be 4000 characters or fewer',
  past_schedule: 'Cannot schedule in the past',
  recipient_empty: 'At least one recipient is required',
  event_inactive: 'Event is not active',
  event_ended: 'Cannot schedule after event end date',
  recipient_not_interpreter: 'One or more recipients are not interpreters of this event',
  not_scheduled: 'This schedule has already been sent or cancelled',
  unknown: 'An error occurred',
};

export function getScheduledNoticeErrorMessage(
  code: ScheduledNoticeErrorCode,
  locale: 'ko' | 'en' = 'ko'
): string {
  return (locale === 'en' ? EN_MAP : KO_MAP)[code];
}
