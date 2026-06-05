# Handoff — PRD #19 AI 자동 답변 설계 세션 (2026-06-05 ai-design)

## 컨텍스트

오전 세션 (handoff-2026-06-05.md) 직후 컴퓨터 재부팅. 재개 시 마이그 운영 push 1번 → 사실 047까지 이미 운영 적용 완료 확인. 2번 OpenAI 키 입력으로 넘어가려다 사용자 = "키 입력 전 프롬프트 설계 다시 보자". 본 세션 = 설계만, 코드 0.

## 세션 결과

PRD #19 본문 검토 + 운영 양식 jsonb 검사 + 시스템 프롬프트 보강 + 캐시 키 재결정. **결정 7건 PRD 본문에 "결정사항 보강 (2026-06-05 설계 세션)" 절로 추가**.

## 결정 7건 요약

| # | 항목 | 결정 |
|---|---|---|
| D1 | 시스템 프롬프트 | 10규칙 → 12규칙 (11 미입력무시 + 12 창작금지 + 2/5 미세) |
| D2 | user msg 포맷 | label:value 줄별, 빈 값 = `(미입력)` |
| D3 | industry 등 3종 | 양식 기존 키 활용, 시스템 필드 폐기. 마이그 048 미작성 |
| D4 | prompt fallback | 양식 키 후보 리스트 순회 매핑 |
| D5 | sellers prefill | extra_info '업종' prefill, EXTRA_LABELS '업종' 추가 |
| D6 | 캐시 키 | K1 (consultation_id 만), context_hash 상수 `'v1'` |
| D7 | 불참 가드 | `isAbsentFlow` 분기 + AI 버튼 disable 1줄 |

## 발견 사실 (운영 DB)

### 마이그 운영 상태

운영 = 047 까지 timestamp 형태로 적용 완료. 핸드오프 메모 "040~042 미반영" 은 stale. MCP `list_migrations` 로 확인.

| 로컬 | 운영 timestamp |
|---|---|
| 040_scheduled_notices | 20260529062225 |
| 041_messages_retention | 20260529062057 |
| 042_messages_replica_identity | 20260529062023 |
| 043_ensure_system_template_fields | 20260528053534 |
| 044_interpreter_management | 20260605022932 |
| 045_notices_realtime | 20260605022939 |
| 046_ai_auto_answer | 20260605023023 |
| 047_interpreter_management_hardening | 20260605023039 |

### 운영 양식 jsonb (2 사례)

**양식 A** (`a1d794c0-5b2a-4d06-9f2b-f4ed580ac600`, 한글 키):
- order 11 `상담품목` text, optional
- order 17 `상담세부내용` textarea, optional
- order 20~26 = 046 시스템 필드 7종 주입됨

**양식 B** (`30cb3494-6b75-40c1-a79f-5d7b5d476a5f`, 영어 키):
- order 5 `consultation_item` text, **required=true**
- order 13 `consultation_detail` textarea, **required=true**
- order 9 `export_amount_usd`, order 10 `contract_planned_usd`, order 12 `contract_onsite_usd` (USD 3종)
- order 14~20 = 046 시스템 필드 7종 주입됨

**시사**: 046 의 industry/consultation_content/expected_amount = 양식 기존 키와 의미 중복. key_discussion/buyer_reaction/follow_up/notes = 양식에 없음 (시스템 잠금 가치 있음).

### sellers/buyers/profiles 컬럼

- sellers: id, event_id, company_name, **company_name_kr**, representative, contact_*, **extra_info(jsonb)**
- buyers: id, event_id, company_name, buyer_name, country, booth_number, phone, email, **extra_info(jsonb)**
- profiles: id, email, name, role, phone, language, linked_*, must_change_password, company_name, country, extra_info
- consultations: id, event_id, time_slot_id, buyer_id, seller_id, interpreter_id, status, memo, buyer_status

→ 업종/품목 정식 컬럼 0건. `sellers.extra_info` jsonb 만 가능.

### 엑셀 EXTRA_LABELS (현 상태)

`src/lib/excel/users-parser.ts:55-58`:

```ts
const EXTRA_LABELS = [
  '회사소개', '홈페이지', '회사소개서', '관심분야', '상담회 품목', '품목',
  '호텔명', '호텔 주소', '호텔', '입국 항공사', '항공사', '입국 항공기',
  '항공기', '입국 날짜', '입국', '매출액', '매출', 'revenue',
  ...
];
```

→ "품목" 이미 있음. "업종" 추가 필요 (S3 작업 시).

### 불참 분기 (이미 구현됨)

`src/components/interpreter/MultiStepReportForm.tsx:89-100`:

```ts
const isAbsentFlow = ABSENT_CONSULTATION_TYPES.includes(values[CONSULTATION_TYPE_KEY]);
// ...
if (isAbsentFlow && f.key !== CONSULTATION_TYPE_KEY && f.key !== ABSENCE_REASON_KEY) {
  return false;
}
```

→ 불참 시 양식 필드 전부 숨김, AI 시스템 필드도 자동 숨김. AI 버튼만 추가 disable 가드 1줄.

## 최종 시스템 프롬프트 (S1 코드 시 상수)

```
너는 정부·기관 제출용 수출상담회 상담일지를 작성하는 전문 비즈니스 문서 작성 AI이다.

사용자가 아래 정보를 입력하면, 이를 바탕으로 자연스럽고 실제 상담회 결과보고서 같은 문체의 상담일지를 작성한다.

[입력 정보]
* 국내기업명
* 국내기업 업종 또는 주요품목
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
2. 문체는 공공기관 제출용 문체, 한국어로 작성한다.
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
```

## prompt builder 매핑 표 (S1 코드 시 상수)

| 입력 항목 | fallback 순서 |
|---|---|
| 국내기업명 | `sellers.company_name_kr` → `sellers.company_name` |
| 국내기업 업종/주요품목 | `consultation_item` → `상담품목` → `industry` → `sellers.extra_info->>'업종'` → `sellers.extra_info->>'품목'` |
| 해외바이어명 | `buyers.company_name` |
| 국가 | `buyers.country` |
| 상담내용 | `consultation_detail` → `상담세부내용` → `consultation_content` |
| 주요 논의사항 | `key_discussion` |
| 예상 계약금액 | `contract_planned_usd` → `계약추진액_USD` → `expected_amount` |
| 바이어 반응 | `buyer_reaction` |
| 후속 계획 | `follow_up` |
| 기타 특이사항 | `notes` |

## 다음 액션 (사용자 + 다음 세션)

1. **사용자**: OpenAI API 키 발급 (platform.openai.com Project key 권장)
2. **사용자**: 키 발급 후 GitHub Actions secrets (`OPENAI_API_KEY`, `AI_AUTO_ANSWER_ENABLED=true`) 입력
3. **다음 세션**: PRD #19 S1 코드 시작
   - M2 prompt builder (deep, pure) — 시스템 프롬프트 상수 + 매핑 + label:value 포맷
   - M3 OpenAI client (deep, mockable) — fetch, no-training 헤더, 10s timeout
   - M4 폴백 어댑터 — 기존 `renderAutoAnswer()` 호출
   - Vitest 단위 테스트 (스냅샷 + 빈 값 + variant_index)
   - Codex 검수

## 운영 룰 준수

- 코딩 = 0 (설계만)
- 큰 변경 보고 = 본 핸드오프 ✅
- 파괴적 작업 = 0
- 마이그 운영 push = 0 (047 이미 적용 확인)
- grill-me = 모호점 5건 (industry 출처, 캐시 키, 시스템 프롬프트 보강 등) 모두 사용자 1:1 확정
- 메모리 동기 갱신 = `project_ai_auto_answer.md` ✅
- 세션 히스토리 = 본 파일 ✅

## 참조

- 직전 핸드오프: `handoff-2026-06-05.md`
- PRD 본문: `docs/prd/PRD-19-ai-auto-answer.md` (보강 절 추가됨)
- 회의 원문: `input/상담회 관련 회의 내용.txt` §7.2
- 관련 마이그: 043 (시스템 필드 잠금), 046 (AI 인프라)
- 관련 코드: `src/components/interpreter/MultiStepReportForm.tsx`, `src/lib/excel/users-parser.ts`, `src/lib/template/defaults.ts`
