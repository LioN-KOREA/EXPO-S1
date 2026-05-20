// 자동 답변 생성: {{key}} 치환.
// LLM 사용 안 함. 단순 문자열 치환 + 한글 조사 자동 처리.
//
// 변수 소스:
//   1) 양식 다른 필드 값 (values 객체)
//   2) 바이어/셀러 카드 정보 (consultation 객체):
//      - buyer_company:  consultation.buyer.company_name
//      - buyer_country:  consultation.buyer.country
//      - seller_company: consultation.seller.company_name_kr || company_name
//      - seller_contact: consultation.seller.contact_name
// 누락 값은 '(미입력)' 으로 치환.
//
// 조사 DSL:
//   {{key|이/가}}  →  값 + 받침에 맞는 조사 ("회사이" / "바이어가")
//   지원 페어: 이/가, 을/를, 은/는, 와/과, 이다/다, 이었/였, 으로/로
//   받침 판별: 값의 마지막 한글 음절 (한글 없으면 무받침 취급).
//             괄호 등으로 끝나도 안쪽 마지막 한글 글자로 판정.

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

// ============================================================
// 한글 조사 처리
// ============================================================

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JONG_COUNT = 28;
const JONG_RIEUL = 8; // ㄹ 받침 인덱스

// 값의 마지막 한글 음절을 찾아 종성(받침) 인덱스 반환. 없으면 null.
function lastJongseong(value: string): number | null {
  for (let i = value.length - 1; i >= 0; i--) {
    const code = value.charCodeAt(i);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      return (code - HANGUL_START) % JONG_COUNT;
    }
  }
  return null;
}

type JosaResolver = (hasFinal: boolean, isRieul: boolean) => string;

const JOSA_PAIRS: Record<string, JosaResolver> = {
  '이/가': (f) => (f ? '이' : '가'),
  '을/를': (f) => (f ? '을' : '를'),
  '은/는': (f) => (f ? '은' : '는'),
  '과/와': (f) => (f ? '과' : '와'),
  '와/과': (f) => (f ? '과' : '와'),
  '이다/다': (f) => (f ? '이다' : '다'),
  '이었/였': (f) => (f ? '이었' : '였'),
  '으로/로': (f, r) => (!f || r ? '로' : '으로'),
};

function resolveJosa(value: string, pair: string): string {
  const resolver = JOSA_PAIRS[pair];
  if (!resolver) return pair; // 알 수 없는 페어 → 원문 유지
  const jong = lastJongseong(value);
  if (jong === null) {
    // 한글 음절 없음 → 무받침 취급
    return resolver(false, false);
  }
  return resolver(jong !== 0, jong === JONG_RIEUL);
}

// {{key}} 또는 {{key|페어}} 매칭. key 는 영숫자/언더스코어, 페어는 한글/슬래시.
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}|\s]+))?\s*\}\}/g;

export function renderAutoAnswer(
  template: string,
  ctx: Record<string, string>
): string {
  return template.replace(TOKEN_RE, (_match, key: string, pair: string | undefined) => {
    const value = ctx[key] ?? MISSING;
    if (!pair) return value;
    return value + resolveJosa(value, pair);
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

// 지원 조사 페어 목록 (TemplateEditor 가이드용)
export const JOSA_PAIR_KEYS: ReadonlyArray<string> = [
  '이/가',
  '을/를',
  '은/는',
  '와/과',
  '으로/로',
  '이었/였',
  '이다/다',
];
