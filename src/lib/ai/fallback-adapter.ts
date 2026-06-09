// PRD #19 M4 — LLM 실패·비활성화 시 기존 양식 폴백 답변 생성.
// route.ts 의 폴백 분기를 pure function 으로 분리해 단위 테스트 가능하게 함.
//
// PRD §Solution: "LLM 호출이 실패하거나(타임아웃·5xx·429·rate limit·일일 비용 상한 초과·
// kill switch·응답 이상) 운영자가 비활성화한 경우, 기존 auto_answer_template 치환을
// 폴백으로 사용해 통역사 화면은 항상 답변을 받는다."
//
// 입력 template_row 가 null 이거나 auto_answer_template 가 비어있으면 null 반환.
// 호출자는 null 일 때 503/에러 응답으로 강등한다.

import { buildAutoAnswerContext, renderAutoAnswer } from '@/lib/template/autoAnswer';
import { ensureSystemFields } from '@/lib/template/defaults';
import type { TemplateField } from '@/types';

interface ConsultationLike {
  buyer?: {
    company_name?: string | null;
    country?: string | null;
  } | null;
  seller?: {
    company_name?: string | null;
    company_name_kr?: string | null;
    contact_name?: string | null;
  } | null;
}

export interface FallbackAdapterInput {
  templateRow: {
    fields?: unknown;
    auto_answer_template?: unknown;
  } | null;
  formValues: Record<string, unknown>;
  consultation: ConsultationLike;
}

export function buildTemplateFallback(input: FallbackAdapterInput): string | null {
  const tpl = typeof input.templateRow?.auto_answer_template === 'string'
    ? input.templateRow.auto_answer_template.trim()
    : '';
  if (tpl.length === 0) return null;

  const rawFields = Array.isArray(input.templateRow?.fields)
    ? (input.templateRow!.fields as TemplateField[])
    : [];
  // 시스템 필드는 빈 fields 에서도 무조건 주입 (consultation_type/absence_reason 등 키 존재 보장).
  const fields = ensureSystemFields(rawFields);
  const ctx = buildAutoAnswerContext(fields, input.formValues, input.consultation);
  return renderAutoAnswer(tpl, ctx);
}
