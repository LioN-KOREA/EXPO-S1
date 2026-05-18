import type { AutoSourceKey, Consultation, TemplateField } from '@/types';

// 자동 채움 매핑 — 라벨에 포함된 키워드로 autoSource를 추론
const LABEL_HINTS: Array<{ patterns: RegExp[]; autoSource: AutoSourceKey }> = [
  { patterns: [/상담일/, /상담\s*날짜/, /일자/, /^date$/i, /consultation\s*date/i], autoSource: 'time_slot.date' },
  { patterns: [/시작\s*시간/, /start\s*time/i], autoSource: 'time_slot.start_time' },
  { patterns: [/종료\s*시간/, /end\s*time/i], autoSource: 'time_slot.end_time' },
  { patterns: [/바이어\s*회사/, /바이어\s*기업/, /buyer\s*company/i], autoSource: 'buyer.company_name' },
  { patterns: [/바이어\s*명/, /바이어\s*이름/, /^바이어$/, /buyer\s*name/i], autoSource: 'buyer.buyer_name' },
  { patterns: [/국가/, /country/i], autoSource: 'buyer.country' },
  { patterns: [/부스/, /booth/i], autoSource: 'buyer.booth_number' },
  { patterns: [/국내\s*기업\s*담당자\s*명/, /국내.*담당자\s*명/, /참가\s*기업\s*담당자\s*명/], autoSource: 'seller.contact_name' },
  { patterns: [/담당자\s*전화/, /연락처/, /phone/i, /tel/i], autoSource: 'seller.contact_phone' },
  { patterns: [/국내\s*기업\s*명/, /국내\s*기업/, /참가\s*기업\s*명/, /참가\s*기업/, /국내\s*회사/, /seller\s*company/i], autoSource: 'seller.company_name_kr' },
  { patterns: [/이메일/, /e-?mail/i], autoSource: 'seller.email' },
];

export function inferAutoSourceFromLabel(label: string): AutoSourceKey | undefined {
  const trimmed = label.trim();
  for (const { patterns, autoSource } of LABEL_HINTS) {
    if (patterns.some((p) => p.test(trimmed))) return autoSource;
  }
  return undefined;
}

// 관리자 라벨 추론 — 라벨에 포함된 키워드로 admin source 제안
const ADMIN_LABEL_PATTERNS: RegExp[] = [
  /바이어\s*ID/i,
  /buyer\s*id/i,
  /사업자\s*등록/,
  /business\s*reg/i,
  /담당자\s*직위/,
  /직위/,
  /position/i,
];

export function isAdminLabel(label: string): boolean {
  const trimmed = label.trim();
  return ADMIN_LABEL_PATTERNS.some((p) => p.test(trimmed));
}

// consultation 객체에서 autoSource 키로 값 추출
export function extractAutoValue(
  consultation: Pick<Consultation, 'time_slot' | 'buyer' | 'seller'>,
  key: AutoSourceKey,
): string | null {
  const [scope, field] = key.split('.') as [keyof typeof consultation, string];
  const obj = consultation[scope] as Record<string, unknown> | undefined | null;
  if (!obj) return null;
  const v = obj[field];
  return v == null ? null : String(v);
}

// 전체 자동 필드 채우기
export function buildAutoValues(
  consultation: Pick<Consultation, 'time_slot' | 'buyer' | 'seller'>,
  fields: TemplateField[],
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const f of fields) {
    if (f.source !== 'auto' || !f.autoSource) continue;
    result[f.key] = extractAutoValue(consultation, f.autoSource);
  }
  return result;
}

// 자동 매핑 가능 옵션 (편집기 select 표시용)
export const AUTO_SOURCE_OPTIONS: { value: AutoSourceKey; label: string }[] = [
  { value: 'time_slot.date', label: '상담일' },
  { value: 'time_slot.start_time', label: '시작 시간' },
  { value: 'time_slot.end_time', label: '종료 시간' },
  { value: 'buyer.company_name', label: '바이어 회사명' },
  { value: 'buyer.buyer_name', label: '바이어명' },
  { value: 'buyer.country', label: '국가' },
  { value: 'buyer.booth_number', label: '부스 번호' },
  { value: 'seller.company_name', label: '국내기업명 (영문)' },
  { value: 'seller.company_name_kr', label: '국내기업명' },
  { value: 'seller.contact_name', label: '국내기업 담당자명' },
  { value: 'seller.contact_phone', label: '담당자 전화번호' },
  { value: 'seller.email', label: '담당자 이메일' },
];
