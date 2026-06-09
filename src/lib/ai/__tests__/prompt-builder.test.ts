import { describe, expect, it } from 'vitest';
import { buildPrompt, MISSING, SYSTEM_PROMPT } from '@/lib/ai/prompt-builder';

const BASE = {
  consultation: {
    buyer: { company_name: 'ACME Corp', country: 'USA' },
    seller: { company_name_kr: '한국상사', company_name: 'Korea Trading' },
  },
  formValues: {},
  variantIndex: 0,
};

describe('buildPrompt', () => {
  it('SYSTEM_PROMPT 13 규칙 잠금 (스냅샷)', () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });

  it('variant 0~4 temperature 매핑', () => {
    const temps = [0, 1, 2, 3, 4].map(
      (i) => buildPrompt({ ...BASE, variantIndex: i }).temperature,
    );
    expect(temps).toEqual([0.7, 0.85, 1.0, 0.85, 0.95]);
  });

  it('variant 범위 벗어남 → 0~4 clamp', () => {
    expect(buildPrompt({ ...BASE, variantIndex: -1 }).temperature).toBe(0.7);
    expect(buildPrompt({ ...BASE, variantIndex: 99 }).temperature).toBe(0.95);
  });

  it('variant NaN/분수/Infinity → 0 fallback (런타임 안전)', () => {
    expect(buildPrompt({ ...BASE, variantIndex: NaN }).temperature).toBe(0.7);
    expect(buildPrompt({ ...BASE, variantIndex: 1.5 }).temperature).toBe(0.85); // floor → 1
    expect(buildPrompt({ ...BASE, variantIndex: Infinity }).temperature).toBe(0.7);
    expect(buildPrompt({ ...BASE, variantIndex: -Infinity }).temperature).toBe(0.7);
  });

  it('variant 3/4 만 hint 라인 추가', () => {
    for (const i of [0, 1, 2]) {
      const { user } = buildPrompt({ ...BASE, variantIndex: i });
      expect(user.includes('직전 시안')).toBe(false);
    }
    expect(buildPrompt({ ...BASE, variantIndex: 3 }).user).toContain('도입부 어순');
    expect(buildPrompt({ ...BASE, variantIndex: 4 }).user).toContain('결론부 표현');
  });

  it('user 메시지 = label:value 줄 포맷', () => {
    const { user } = buildPrompt({
      ...BASE,
      formValues: {
        consultation_item: '냉동만두',
        consultation_detail: '샘플 송부 협의',
        key_discussion: '가격',
        contract_planned_usd: '50000',
        buyer_reaction: '긍정',
        follow_up: '2주 후 재미팅',
        notes: '특이사항 없음',
      },
    });
    expect(user).toContain('국내기업명: 한국상사');
    expect(user).toContain('상담품목: 냉동만두');
    expect(user).toContain('해외바이어명: ACME Corp');
    expect(user).toContain('국가: USA');
    expect(user).toContain('상담내용: 샘플 송부 협의');
    expect(user).toContain('주요 논의사항: 가격');
    expect(user).toContain('예상 계약금액: 50000');
    expect(user).toContain('바이어 반응: 긍정');
    expect(user).toContain('후속 계획: 2주 후 재미팅');
    expect(user).toContain('기타 특이사항: 특이사항 없음');
  });

  it('sellerName = company_name_kr 우선, 없으면 company_name', () => {
    const a = buildPrompt({
      ...BASE,
      consultation: {
        ...BASE.consultation,
        seller: { company_name_kr: '국문명', company_name: 'EN Name' },
      },
    });
    expect(a.user).toContain('국내기업명: 국문명');

    const b = buildPrompt({
      ...BASE,
      consultation: {
        ...BASE.consultation,
        seller: { company_name: 'EN Only', company_name_kr: '' },
      },
    });
    expect(b.user).toContain('국내기업명: EN Only');
  });

  it('industry: 양식 키 fallback 우선순위 (consultation_item → 상담품목 → consultation_product → industry)', () => {
    const a = buildPrompt({
      ...BASE,
      formValues: { 상담품목: 'B키만', industry: 'D키만' },
    });
    expect(a.user).toContain('상담품목: B키만');

    const b = buildPrompt({
      ...BASE,
      formValues: { industry: 'D키만' },
    });
    expect(b.user).toContain('상담품목: D키만');
  });

  it('industry: 양식값 없으면 sellers.extra_info 업종/품목 fallback', () => {
    const a = buildPrompt({
      ...BASE,
      consultation: {
        ...BASE.consultation,
        seller: {
          ...BASE.consultation.seller,
          extra_info: { '업종': '식품' },
        },
      },
    });
    expect(a.user).toContain('상담품목: 식품');

    const b = buildPrompt({
      ...BASE,
      consultation: {
        ...BASE.consultation,
        seller: {
          ...BASE.consultation.seller,
          extra_info: { '품목': '냉동' },
        },
      },
    });
    expect(b.user).toContain('상담품목: 냉동');
  });

  it('expected_amount: 6키 fallback 첫 비어있지 않은 값 채택', () => {
    const a = buildPrompt({
      ...BASE,
      formValues: { contract_planned_usd: '10000', onsite_contract_amount: '99999' },
    });
    expect(a.user).toContain('예상 계약금액: 10000');

    const b = buildPrompt({
      ...BASE,
      formValues: { onsite_contract_amount: '99999' },
    });
    expect(b.user).toContain('예상 계약금액: 99999');
  });

  it('빈 값/누락 → (미입력)', () => {
    const { user } = buildPrompt({
      ...BASE,
      consultation: { buyer: null, seller: null },
      formValues: { consultation_item: '', consultation_detail: '   ' },
    });
    expect(user).toContain(`국내기업명: ${MISSING}`);
    expect(user).toContain(`상담품목: ${MISSING}`);
    expect(user).toContain(`해외바이어명: ${MISSING}`);
    expect(user).toContain(`국가: ${MISSING}`);
    expect(user).toContain(`상담내용: ${MISSING}`);
  });

  it('output 객체 = {system, user, temperature} 만', () => {
    const out = buildPrompt(BASE);
    expect(Object.keys(out).sort()).toEqual(['system', 'temperature', 'user']);
    expect(out.system).toBe(SYSTEM_PROMPT);
  });
});
