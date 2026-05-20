-- ============================================
-- 상담일지 양식 — 자동 답변 템플릿
-- 통역사가 "자동 답변 생성" 버튼 클릭 시, 양식 다른 필드 값 + 바이어/셀러 카드 정보를
-- {{변수}} 형식으로 치환해 textarea(세부 상담내용 등)에 주입.
-- LLM 호출 없음. 단순 문자열 치환.
-- ============================================

ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS auto_answer_template TEXT;

COMMENT ON COLUMN report_templates.auto_answer_template IS
  '자동 답변 생성 템플릿. {{key}} 형식으로 양식 필드값/바이어·셀러 카드 정보 치환. NULL = 자동 답변 비활성';

-- 기본 템플릿 (BIS@T 패턴) — 기존 행에 일괄 시드
UPDATE report_templates
SET auto_answer_template = $TEMPLATE$국내기업 {{seller_company}}는 {{consultation_item}}에 대한 상담을 진행했습니다. 바이어는 {{buyer_company}}({{buyer_country}})이며, {{consultation_type}}으로 진행되었습니다. 거래 가능성은 '{{trade_possibility}}'로 평가되었고, 매칭 만족도는 바이어 '{{buyer_satisfaction}}', 국내기업 '{{seller_satisfaction}}'였습니다.

수출 상담액은 {{export_amount_usd}} USD, 계약 추진액은 {{contract_planned_usd}} USD로 예상됩니다. 현장 계약 여부는 '{{contract_signed_onsite}}'이며, 현장 계약액은 {{contract_onsite_usd}} USD입니다.

[상담 중 논의된 세부 내용을 이어서 작성해주세요]$TEMPLATE$
WHERE auto_answer_template IS NULL;
