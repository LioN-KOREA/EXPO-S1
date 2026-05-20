// 자동 답변 생성: {{key}} 치환.
// LLM 사용 안 함. 단순 문자열 치환만.
//
// 변수 소스:
//   1) 양식 다른 필드 값 (values 객체)
//   2) 바이어/셀러 카드 정보 (consultation 객체):
//      - buyer_company:  consultation.buyer.company_name
//      - buyer_country:  consultation.buyer.country
//      - seller_company: consultation.seller.company_name_kr || company_name
//      - seller_contact: consultation.seller.contact_name
// 누락 값은 '(미입력)' 으로 치환.

import type { TemplateField } from '@/types';

type ConsultationLike = {
  buyer?: {
    company_name?: string | null;
    country?: string | null;
  } | null;
  seller?: {
    company_name?: string | null;
    company_name_kr?: string | null;
    contact_name?: string | null;
  } | null;
} | null;

const MISSING = '(미입력)';

function formatVar(field: TemplateField | undefined, raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return MISSING;
  if (field?.type === 'number' && typeof raw === 'number') {
    return raw.toLocaleString('ko-KR');
  }
  return String(raw);
}

export function buildAutoAnswerContext(
  fields: TemplateField[],
  values: Record<string, unknown>,
  consultation: ConsultationLike
): Record<string, string> {
  const ctx: Record<string, string> = {};

  // 양식 필드값
  for (const f of fields) {
    ctx[f.key] = formatVar(f, values[f.key]);
  }

  // 바이어/셀러 카드 정보 (양식 필드와 키 충돌 시 카드 정보 우선)
  ctx.buyer_company = consultation?.buyer?.company_name?.toString().trim() || MISSING;
  ctx.buyer_country = consultation?.buyer?.country?.toString().trim() || MISSING;
  ctx.seller_company =
    consultation?.seller?.company_name_kr?.toString().trim() ||
    consultation?.seller?.company_name?.toString().trim() ||
    MISSING;
  ctx.seller_contact = consultation?.seller?.contact_name?.toString().trim() || MISSING;

  return ctx;
}

export function renderAutoAnswer(
  template: string,
  ctx: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return ctx[key] ?? MISSING;
  });
}

// 사용 가능한 변수 키 목록 (TemplateEditor 가이드용)
export function listAutoAnswerVariables(fields: TemplateField[]): Array<{ key: string; label: string }> {
  const formVars = fields.map((f) => ({ key: f.key, label: f.label }));
  return [
    ...formVars,
    { key: 'buyer_company', label: '바이어 회사명 (카드)' },
    { key: 'buyer_country', label: '바이어 국가 (카드)' },
    { key: 'seller_company', label: '국내기업 회사명 (카드)' },
    { key: 'seller_contact', label: '국내기업 담당자 (카드)' },
  ];
}
