// 메신저 첨부 검증 (순수 함수).
// 이미지(JPG/PNG/WEBP) + PDF, 파일당 5MB, 메시지당 3개.

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

interface FileLike {
  name: string;
  size: number;
  type: string;
}

export function validateAttachments(files: FileLike[]): ValidationResult {
  if (files.length === 0) return { ok: true };
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, error: `첨부는 최대 ${MAX_ATTACHMENTS_PER_MESSAGE}개까지 가능합니다` };
  }
  for (const f of files) {
    if (!ALLOWED_MIME_TYPES.includes(f.type as AllowedMime)) {
      return { ok: false, error: `허용되지 않은 파일 형식: ${f.name} (${f.type || '알 수 없음'})` };
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `파일이 5MB 를 초과합니다: ${f.name}` };
    }
    if (f.size <= 0) {
      return { ok: false, error: `빈 파일은 업로드할 수 없습니다: ${f.name}` };
    }
  }
  return { ok: true };
}

// 안전한 filename (slash 제거, 시작 문자 화이트리스트, 정규식과 일치)
export function sanitizeFilename(name: string): string {
  const noPath = name.replace(/[\\/]/g, '_');
  const trimmed = noPath.replace(/^[. ]+/, ''); // 점·공백 시작 제거
  const cleaned = trimmed.replace(/[^A-Za-z0-9._\-+ ()]/g, '_');
  // 첫 문자 영숫자/언더스코어 보장
  const safe = /^[A-Za-z0-9_]/.test(cleaned) ? cleaned : `_${cleaned}`;
  return safe.slice(0, 200);
}

// Storage 업로드 경로 정규식 (마이그 035 messenger_storage_thread_id 와 동일).
export const STORAGE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_][A-Za-z0-9._\-+ ()]*$/;

export interface AttachmentMetaInput {
  path: string;
  name: string;
  size: number;
  mime: string;
}

/**
 * API 라우트용 서버측 attachment 메타 검증.
 * - JSON 형태 검사 (object + 필수 키 string/number)
 * - threadId prefix 강제 (cross-thread 위장 차단)
 * - 경로 정규식 (UUID/UUID/safe-filename)
 * - MIME 화이트리스트
 * - 크기 범위
 * - 개수 제한
 *
 * 통과 시 정규화된 AttachmentMetaInput[] 반환, 실패 시 error 메시지.
 */
export function validateAttachmentMetaList(
  raw: unknown[],
  threadId: string
): { ok: true; metas: AttachmentMetaInput[] } | { ok: false; error: string } {
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, error: `첨부는 최대 ${MAX_ATTACHMENTS_PER_MESSAGE}개` };
  }
  const out: AttachmentMetaInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') {
      return { ok: false, error: '첨부 메타 형식 오류' };
    }
    const o = x as Record<string, unknown>;
    if (
      typeof o.path !== 'string' ||
      typeof o.name !== 'string' ||
      typeof o.size !== 'number' ||
      typeof o.mime !== 'string'
    ) {
      return { ok: false, error: '첨부 메타 필수 키 누락' };
    }
    if (!o.path.startsWith(`${threadId}/`)) {
      return { ok: false, error: '첨부 경로가 thread 와 일치하지 않습니다' };
    }
    if (!STORAGE_PATH_RE.test(o.path)) {
      return { ok: false, error: '첨부 경로 형식 오류' };
    }
    if (!ALLOWED_MIME_TYPES.includes(o.mime as AllowedMime)) {
      return { ok: false, error: '허용되지 않은 MIME' };
    }
    if (o.size <= 0 || o.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: '파일 크기 범위 초과' };
    }
    out.push({ path: o.path, name: o.name, size: o.size, mime: o.mime });
  }
  return { ok: true, metas: out };
}
