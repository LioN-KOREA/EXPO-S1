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
