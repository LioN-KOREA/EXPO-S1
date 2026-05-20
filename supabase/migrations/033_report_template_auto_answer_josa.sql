-- ============================================
-- 자동 답변 기본 템플릿 — 한글 조사 자동 처리(josa DSL) 적용
-- 마이그 032 에서 시드된 어색한 조사("…는", "…였습니다", "…'로") 위치를
-- josa DSL ({{key|페어}}) 또는 평이한 문장으로 교체.
--
-- 갱신 대상: 마이그 032 가 시드한 "정확히 같은" 텍스트만.
--           관리자가 직접 편집한 커스텀 템플릿은 보존(WHERE 절로 매칭 제외).
-- ============================================

UPDATE report_templates
SET auto_answer_template = $NEW$국내기업 {{seller_company|은/는}} {{consultation_item}}에 대한 상담을 진행했습니다. 바이어는 {{buyer_company}}({{buyer_country}})이며, {{consultation_type|으로/로}} 진행되었습니다. 거래 가능성은 '{{trade_possibility}}' 등급으로 평가되었고, 매칭 만족도는 바이어 '{{buyer_satisfaction}}', 국내기업 '{{seller_satisfaction}}' 수준으로 평가되었습니다.

수출 상담액은 {{export_amount_usd}} USD, 계약 추진액은 {{contract_planned_usd}} USD로 예상됩니다. 현장 계약 여부는 '{{contract_signed_onsite}}'이며, 현장 계약액은 {{contract_onsite_usd}} USD입니다.

[상담 중 논의된 세부 내용을 이어서 작성해주세요]$NEW$
WHERE auto_answer_template = $OLD$국내기업 {{seller_company}}는 {{consultation_item}}에 대한 상담을 진행했습니다. 바이어는 {{buyer_company}}({{buyer_country}})이며, {{consultation_type}}으로 진행되었습니다. 거래 가능성은 '{{trade_possibility}}'로 평가되었고, 매칭 만족도는 바이어 '{{buyer_satisfaction}}', 국내기업 '{{seller_satisfaction}}'였습니다.

수출 상담액은 {{export_amount_usd}} USD, 계약 추진액은 {{contract_planned_usd}} USD로 예상됩니다. 현장 계약 여부는 '{{contract_signed_onsite}}'이며, 현장 계약액은 {{contract_onsite_usd}} USD입니다.

[상담 중 논의된 세부 내용을 이어서 작성해주세요]$OLD$;
