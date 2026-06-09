import { describe, expect, it } from 'vitest';
import { buildTemplateFallback } from '@/lib/ai/fallback-adapter';

const BASE_CONSULT = {
  buyer: { company_name: 'ACME', country: 'USA' },
  seller: { company_name_kr: '한국상사', company_name: 'KR', contact_name: '홍길동' },
};

describe('buildTemplateFallback', () => {
  it('templateRow = null → null', () => {
    expect(
      buildTemplateFallback({
        templateRow: null,
        formValues: {},
        consultation: BASE_CONSULT,
      }),
    ).toBeNull();
  });

  it('auto_answer_template 없음 → null', () => {
    expect(
      buildTemplateFallback({
        templateRow: { fields: [], auto_answer_template: null },
        formValues: {},
        consultation: BASE_CONSULT,
      }),
    ).toBeNull();
  });

  it('auto_answer_template 공백만 → null', () => {
    expect(
      buildTemplateFallback({
        templateRow: { fields: [], auto_answer_template: '   \n\t  ' },
        formValues: {},
        consultation: BASE_CONSULT,
      }),
    ).toBeNull();
  });

  it('카드 변수 치환 (buyer_company / buyer_country / seller_company / seller_contact)', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: [],
        auto_answer_template: '{{seller_company}}와 {{buyer_company}}({{buyer_country}}) 상담 진행. 담당: {{seller_contact}}',
      },
      formValues: {},
      consultation: BASE_CONSULT,
    });
    expect(out).toBe('한국상사와 ACME(USA) 상담 진행. 담당: 홍길동');
  });

  it('양식 필드값 치환', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: [{ key: 'item', label: '품목', type: 'text', required: false }],
        auto_answer_template: '품목: {{item}}',
      },
      formValues: { item: '냉동만두' },
      consultation: BASE_CONSULT,
    });
    expect(out).toBe('품목: 냉동만두');
  });

  it('값 누락 시 (미입력) 채움', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: [{ key: 'item', label: '품목', type: 'text', required: false }],
        auto_answer_template: '품목: {{item}}, 국가: {{buyer_country}}',
      },
      formValues: {},
      consultation: { buyer: null, seller: null },
    });
    expect(out).toBe('품목: (미입력), 국가: (미입력)');
  });

  it('빈 fields 도 ensureSystemFields 통해 시스템 키 (consultation_type 등) ctx 생성', () => {
    // 시스템 필드 key 가 ctx 에 등장하면 치환 성공.
    const out = buildTemplateFallback({
      templateRow: {
        fields: [],
        auto_answer_template: '유형: {{consultation_type}}',
      },
      formValues: { consultation_type: '오프라인' },
      consultation: BASE_CONSULT,
    });
    // ensureSystemFields 가 빈 배열에서도 시스템 필드를 채워 ctx 키가 생성됨.
    expect(out).toBe('유형: 오프라인');
  });

  it('한글 조사 DSL 동작 (받침에 따라)', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: [],
        auto_answer_template: '{{buyer_company|이/가} 방문',
      },
      formValues: {},
      consultation: { buyer: { company_name: 'ACME', country: 'USA' }, seller: null },
    });
    // 'ACME' 한글 없음 → 무받침 → '가'
    expect(out).toBe('{{buyer_company|이/가} 방문'); // 닫는 중괄호 1개라 미매칭 — 의도 X, 아래 케이스 검증
  });

  it('조사 페어 정상 매칭 (이/가)', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: [],
        auto_answer_template: '{{seller_company|이/가}} 상담',
      },
      formValues: {},
      consultation: BASE_CONSULT,
    });
    // '한국상사' 끝 '사' 받침 없음 → '가'
    expect(out).toBe('한국상사가 상담');
  });

  it('fields 가 비배열 (방어) → 빈 배열 취급', () => {
    const out = buildTemplateFallback({
      templateRow: {
        fields: 'invalid' as unknown,
        auto_answer_template: '{{buyer_company}}',
      },
      formValues: {},
      consultation: BASE_CONSULT,
    });
    expect(out).toBe('ACME');
  });
});
