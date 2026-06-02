// API route 사전 검증 — RPC 가드와 일관된 룰 + 형식 검증을 한 번 더 거름.
// RPC 가 최종 권위지만, malformed UUID/timestamp 같은 케이스는 여기서 400 으로 차단해
// 'unknown' 응답을 줄이고 클라이언트 에러 메시지를 정확히 한다.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_MAX = 4000;

export type ValidationError =
  | 'event_id_invalid'
  | 'message_empty'
  | 'message_too_long'
  | 'scheduled_at_invalid'
  | 'recipient_empty'
  | 'recipient_id_invalid'
  | 'id_invalid';

export function validateUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateMessage(message: string): ValidationError | null {
  if (message.trim().length === 0) return 'message_empty';
  if (message.length > MESSAGE_MAX) return 'message_too_long';
  return null;
}

export function validateScheduledAt(value: string): ValidationError | null {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return 'scheduled_at_invalid';
  return null;
}

export function validateRecipientUserIds(value: unknown): ValidationError | null {
  if (!Array.isArray(value)) return 'recipient_empty';
  if (value.length === 0) return 'recipient_empty';
  if (!value.every((v) => typeof v === 'string')) return 'recipient_id_invalid';
  if (!value.every((v) => validateUuid(v as string))) return 'recipient_id_invalid';
  return null;
}
