import type { TemplateField } from '@/types';

// BIS@T 상담일지 R-AE 컬럼 기반 기본 양식 (통역사 입력 필드만).
// 자동 채움 정보(상담일/바이어/셀러)는 엑셀 다운로드의 기본 컬럼(C-Q)에 담기므로 양식에 포함하지 않음.
// 불참 선택 시 consultation_type + absence_reason 외 모두 숨김 처리 (MultiStepReportForm).

export const ABSENT_CONSULTATION_TYPES = ['국내기업 불참', '바이어 불참'];

// 자동 답변 생성 기본 템플릿 (BIS@T 패턴).
// {{key}} 치환: 양식 다른 필드 값 + 바이어/셀러 카드 정보(buyer_company / buyer_country / seller_company).
// 통역사가 '자동 답변 생성' 클릭 시 세부 상담내용 textarea 에 주입.
export const DEFAULT_AUTO_ANSWER_TEMPLATE = `국내기업 {{seller_company|은/는}} {{consultation_item}}에 대한 상담을 진행했습니다. 바이어는 {{buyer_company}}({{buyer_country}})이며, {{consultation_type|으로/로}} 진행되었습니다. 거래 가능성은 '{{trade_possibility}}' 등급으로 평가되었고, 매칭 만족도는 바이어 '{{buyer_satisfaction}}', 국내기업 '{{seller_satisfaction}}' 수준으로 평가되었습니다.

수출 상담액은 {{export_amount_usd}} USD, 계약 추진액은 {{contract_planned_usd}} USD로 예상됩니다. 현장 계약 여부는 '{{contract_signed_onsite}}'이며, 현장 계약액은 {{contract_onsite_usd}} USD입니다.

[상담 중 논의된 세부 내용을 이어서 작성해주세요]`;

const SATISFACTION_OPTIONS = ['매우 만족', '만족', '보통', '불만족', '매우 불만족'];

export const DEFAULT_TEMPLATE_FIELDS: TemplateField[] = [
  {
    key: 'consultation_type',
    label: '상담 진행 유형',
    type: 'select',
    options: ['현장 주선 상담', '사전 주선 상담', '국내기업 불참', '바이어 불참'],
    required: true,
    order: 1,
    source: 'interpreter',
  },
  {
    key: 'seller_contact_name',
    label: '국내기업 담당자명',
    type: 'text',
    required: true,
    order: 2,
    source: 'interpreter',
  },
  {
    key: 'seller_contact_title',
    label: '국내기업 담당자 직위',
    type: 'text',
    required: false,
    order: 3,
    source: 'interpreter',
  },
  {
    key: 'seller_business_no',
    label: '국내기업 사업자등록번호',
    type: 'text',
    required: false,
    order: 4,
    source: 'interpreter',
  },
  {
    key: 'consultation_item',
    label: '상담 품목',
    type: 'text',
    required: true,
    order: 5,
    source: 'interpreter',
  },
  {
    key: 'trade_possibility',
    label: '거래 가능성',
    type: 'select',
    options: ['상', '중', '하'],
    required: true,
    order: 6,
    source: 'interpreter',
  },
  {
    key: 'buyer_satisfaction',
    label: '바이어 매칭 만족도',
    type: 'select',
    options: SATISFACTION_OPTIONS,
    required: true,
    order: 7,
    source: 'interpreter',
  },
  {
    key: 'seller_satisfaction',
    label: '국내기업 매칭 만족도',
    type: 'select',
    options: SATISFACTION_OPTIONS,
    required: true,
    order: 8,
    source: 'interpreter',
  },
  {
    key: 'export_amount_usd',
    label: '수출 상담액 (USD)',
    type: 'number',
    required: true,
    order: 9,
    source: 'interpreter',
  },
  {
    key: 'contract_planned_usd',
    label: '계약 추진액 (USD)',
    type: 'number',
    required: true,
    order: 10,
    source: 'interpreter',
  },
  {
    key: 'contract_signed_onsite',
    label: '현장 계약 여부',
    type: 'select',
    options: ['예', '아니오'],
    required: true,
    order: 11,
    source: 'interpreter',
  },
  {
    key: 'contract_onsite_usd',
    label: '현장 계약액 (USD)',
    type: 'number',
    required: true,
    order: 12,
    source: 'interpreter',
  },
  {
    key: 'consultation_detail',
    label: '세부 상담 내용',
    type: 'textarea',
    required: true,
    order: 13,
    source: 'interpreter',
  },
  {
    key: 'absence_reason',
    label: '불참 사유',
    type: 'textarea',
    required: true,
    order: 14,
    source: 'interpreter',
    condition: {
      field: 'consultation_type',
      in: ABSENT_CONSULTATION_TYPES,
    },
  },
];
