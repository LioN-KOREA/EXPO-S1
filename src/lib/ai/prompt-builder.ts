// PRD #19 PoC — AI 상담일지 답변용 프롬프트 빌더.
// pure function. DB 조회·LLM 호출 없음. consultation + 양식값 → { system, user, temperature }.
//
// 매핑 우선순위 (양식별 키 fallback):
//   국내기업명           = sellers.company_name_kr || sellers.company_name
//   업종/주요품목         = 양식 키 (consultation_item / 상담품목 / industry)
//                          → fallback sellers.extra_info['업종'] || ['품목']
//   해외바이어명          = buyers.company_name
//   국가                 = buyers.country
//   상담내용             = 양식 키 (consultation_detail / 상담세부내용 / consultation_content)
//   주요 논의사항         = key_discussion
//   예상 계약금액         = 양식 키 (contract_planned_usd / 계약추진액_USD / expected_amount)
//   바이어 반응           = buyer_reaction
//   후속 계획             = follow_up
//   기타 특이사항         = notes

export const MISSING = '(미입력)';

export const SYSTEM_PROMPT = `너는 정부·기관 제출용 수출상담회 상담일지를 작성하는 전문 비즈니스 문서 작성 AI이다.

사용자가 아래 정보를 입력하면, 이를 바탕으로 자연스럽고 실제 상담회 결과보고서 같은 문체의 상담일지를 작성한다.

[입력 정보]
* 국내기업명
* 상담품목
* 해외바이어명
* 국가
* 상담내용
* 주요 논의사항
* 예상 계약금액
* 바이어 반응
* 후속 계획
* 기타 특이사항

[작성 규칙]
1. 결과물은 "상담일지 보고문" 형태로 작성한다.
2. 문체는 공공기관 제출용 평어체로 작성한다. 종결어미는 "-한다", "-이다", "-되었다", "-였다" 등 평어체만 사용한다. 한국어로 작성한다.
3. 매 요청마다 문장 순서와 어투를 조금씩 변경하여 자연스럽게 작성한다.
4. "이번 상담에서는", "논의하였다", "협의가 이루어졌다" 등의 비즈니스 표현을 활용한다.
5. 분량은 3~6문장, 한 문단으로 작성한다.
6. 너무 과장된 표현은 사용하지 않는다.
7. 사용자가 제공한 금액, 일정, 성과는 자연스럽게 문장 안에 포함한다.
8. 계약 가능성, 샘플 진행, 후속 미팅 등은 실제 무역상담회 결과처럼 현실적으로 작성한다.
9. 매번 동일한 패턴 반복 없이 주어·서술어·도입부를 변경한다.
10. 출력은 바로 제출 가능한 완성형 문장만 출력한다.
11. 입력값이 "(미입력)" 인 항목은 답변에서 언급하지 않는다.
12. 제공된 [입력 정보] 외의 사실·수치·일정·고유명사를 추측·창작하지 않는다.
13. 경어체("-드린다", "-드립니다", "-습니다", "-요" 등) 및 보고 행위 묘사("알려드린다", "보고드린다", "안내드린다" 등)는 사용하지 않는다. 보고문 자체가 보고이므로 보고 행위를 다시 묘사하지 않는다.`;

// PRD #19 D6 — variant_index → temperature + 힌트
const VARIANT_TABLE: Array<{ temperature: number; hint: string | null }> = [
  { temperature: 0.7, hint: null },
  { temperature: 0.85, hint: null },
  { temperature: 1.0, hint: null },
  { temperature: 0.85, hint: '직전 시안과 도입부 어순을 다르게 작성한다.' },
  { temperature: 0.95, hint: '직전 시안과 결론부 표현을 다르게 작성한다.' },
];

// 양식 키 fallback 후보 (운영 양식 A/B + 로컬 시드 양식 C 모두 cover)
const FORM_KEY_CANDIDATES = {
  industry: ['consultation_item', '상담품목', 'consultation_product', 'industry'],
  consultation_content: ['consultation_detail', '상담세부내용', 'consultation_content'],
  expected_amount: [
    'contract_planned_usd',
    '계약추진액_USD',
    'contract_push_amount',
    'consultation_amount',
    'onsite_contract_amount',
    'expected_amount',
  ],
  key_discussion: ['key_discussion'],
  buyer_reaction: ['buyer_reaction'],
  follow_up: ['follow_up'],
  notes: ['notes'],
} as const;

export interface PromptInput {
  consultation: {
    buyer?: { company_name?: string | null; country?: string | null } | null;
    seller?: {
      company_name?: string | null;
      company_name_kr?: string | null;
      extra_info?: Record<string, unknown> | null;
    } | null;
  };
  formValues: Record<string, unknown>;
  variantIndex: number;
}

export interface PromptOutput {
  system: string;
  user: string;
  temperature: number;
}

function firstNonEmpty(values: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = values[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

function readExtra(extra: Record<string, unknown> | null | undefined, key: string): string {
  if (!extra) return '';
  const v = extra[key];
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  return s;
}

function valueOrMissing(s: string): string {
  return s.length > 0 ? s : MISSING;
}

export function buildPrompt(input: PromptInput): PromptOutput {
  const { consultation, formValues, variantIndex } = input;
  const variant = VARIANT_TABLE[Math.max(0, Math.min(4, variantIndex))];

  const sellerName = valueOrMissing(
    (consultation.seller?.company_name_kr?.trim() ||
      consultation.seller?.company_name?.trim() ||
      ''),
  );

  const industryFromForm = firstNonEmpty(formValues, FORM_KEY_CANDIDATES.industry);
  const industry = valueOrMissing(
    industryFromForm ||
      readExtra(consultation.seller?.extra_info, '업종') ||
      readExtra(consultation.seller?.extra_info, '품목'),
  );

  const buyerName = valueOrMissing(consultation.buyer?.company_name?.trim() || '');
  const country = valueOrMissing(consultation.buyer?.country?.trim() || '');

  const consultationContent = valueOrMissing(
    firstNonEmpty(formValues, FORM_KEY_CANDIDATES.consultation_content),
  );
  const keyDiscussion = valueOrMissing(firstNonEmpty(formValues, FORM_KEY_CANDIDATES.key_discussion));
  const expectedAmount = valueOrMissing(
    firstNonEmpty(formValues, FORM_KEY_CANDIDATES.expected_amount),
  );
  const buyerReaction = valueOrMissing(firstNonEmpty(formValues, FORM_KEY_CANDIDATES.buyer_reaction));
  const followUp = valueOrMissing(firstNonEmpty(formValues, FORM_KEY_CANDIDATES.follow_up));
  const notes = valueOrMissing(firstNonEmpty(formValues, FORM_KEY_CANDIDATES.notes));

  const lines = [
    `국내기업명: ${sellerName}`,
    `상담품목: ${industry}`,
    `해외바이어명: ${buyerName}`,
    `국가: ${country}`,
    `상담내용: ${consultationContent}`,
    `주요 논의사항: ${keyDiscussion}`,
    `예상 계약금액: ${expectedAmount}`,
    `바이어 반응: ${buyerReaction}`,
    `후속 계획: ${followUp}`,
    `기타 특이사항: ${notes}`,
  ];

  if (variant.hint) {
    lines.push('', variant.hint);
  }

  return {
    system: SYSTEM_PROMPT,
    user: lines.join('\n'),
    temperature: variant.temperature,
  };
}
