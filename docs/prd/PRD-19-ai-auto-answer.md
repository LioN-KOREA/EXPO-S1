## Problem Statement

상담회 현장에서 통역사가 상담일지를 작성할 때 본문(consultation_detail) 입력 부담이 크다. 현재는 `auto_answer_template` 기반 문자열 치환만 제공하므로 (a) 동일 컨텍스트(같은 회사·바이어·품목)에서 매번 동일한 문장만 반복 출력되고, (b) 국내기업·바이어·취급품목·상담목적 등 실제 상담 맥락이 보고문 수준의 자연스러운 한국어 비즈니스 문장으로 반영되지 않는다.

팀장 시연(2026-05-28, `input/상담회 관련 회의 내용.txt` §7.2) 에서 다음 두 가지 개선 요구가 명시되었다:

1. "동일 사용자나 동일 상담 건에서 자동 답변을 반복 생성할 때 내용이 지나치게 동일하게 나오지 않도록 개선" — 답변 다양화.
2. "국내 기업과 바이어 정보, 취급 품목, 상담 목적 등을 반영하여 보다 구체적인 상담 요약" — 컨텍스트 강화.

현 구조(클라이언트사이드 JS 치환, `src/lib/template/autoAnswer.ts`)로는 두 요구 모두 해결 한계가 명확하다.

## Solution

OpenAI gpt-4o-mini 를 활용한 **LLM 기반 자동 답변 생성** 기능을 도입한다. 통역사는 상담일지 작성 화면에서 `[AI 답변 생성]` 단일 버튼을 누르고, 결과가 `consultation_detail` textarea 에 자동 채워진다. 동일 컨텍스트에서 버튼을 다시 누르면 **5개 시안 풀**이 형성되고 그 안에서 순환된다. 풀 키는 `(consultation_id, hash(buyer_id+seller_id+품목+목적))` 이며, 핵심 컨텍스트가 변경되면 새 풀이 시작된다.

답변 톤·구조는 정부·기관 제출용 상담일지 보고문 문체로 통일한다. 시스템 프롬프트는 사용자가 직접 작성한 룰 10가지(공공기관 문체, 매번 어순·도입부 변경, 3-6문장, 과장 금지 등)를 그대로 적용하며, variant 인덱스에 따라 temperature(0.7~1.1)와 "도입부/결론 어순 다르게" 힌트로 다양성을 보장한다.

LLM 호출이 실패하거나(타임아웃·5xx·429·rate limit·일일 비용 상한 초과·kill switch·응답 이상) 운영자가 비활성화한 경우, 기존 `auto_answer_template` 치환을 폴백으로 사용해 통역사 화면은 항상 답변을 받는다. 폴백 사실은 통역사 화면에 노출되지 않으며 admin 모니터링 카드에서만 인지한다.

송신 컨텍스트는 회사명·국가·양식 입력 필드값으로 제한하며 개인 성명·연락처·이메일은 송신하지 않는다. 개인정보처리방침에 OpenAI(미국) 위탁 절을 1줄 추가하고 `ai_call_logs` 에는 prompt 본문을 평문 저장한다(분쟁·디버깅 대비).

## User Stories

1. As an interpreter, I want to click a single `AI 답변 생성` button on the consultation report screen so that 상담일지 본문이 자동 생성된다.
2. As an interpreter, I want the generated answer to be written in 공공기관 제출용 상담일지 보고문 문체 so that 결과물을 추가 수정 없이 제출할 수 있다.
3. As an interpreter, I want to press the button again to get a different variant so that 첫 답변이 마음에 들지 않을 때 다른 안을 받을 수 있다.
4. As an interpreter, I want up to 5 distinct variants per consultation so that 충분한 선택지를 갖는다.
5. As an interpreter, I want clicks beyond 5 to cycle through the existing 5 variants so that 추가 비용이 발생하지 않으면서도 무제한 재선택이 가능하다.
6. As an interpreter, I want a `시안 N/5` chip on the textarea so that 지금 보고 있는 답변이 몇 번째인지 안다.
7. As an interpreter, I want a toast saying "5개 시안을 모두 본 상태입니다. 다시 누르면 시안 1부터 순환합니다." when reaching the cap so that 풀 한도 도달 시점을 안다.
8. As an interpreter, I want a confirmation toast before overwriting my manual edits with a new variant so that 직접 수정한 내용을 실수로 잃지 않는다.
9. As an interpreter, I want the generated answer to reference 국내기업명·해외바이어 회사명·국가·취급품목·상담목적·금액·바이어 반응·후속 계획·기타 특이사항 so that 보고문이 구체적이고 사실 기반이다.
10. As an interpreter, I want the answer to vary 도입부·서술어·문장 순서 each regeneration so that 반복 작성 시 신뢰도가 떨어지지 않는다.
11. As an interpreter, I want LLM failures to be invisible to me so that 현장 작업 흐름이 끊기지 않는다 (폴백 답변이 자연스럽게 표시).
12. As an interpreter, I want the button to time out within 10s so that 무한 대기하지 않는다.
13. As an interpreter, I want the button to work on a 360px mobile screen so that 현장에서 휴대폰으로 사용할 수 있다.
14. As an interpreter, I want a spinner with `생성 중…` label while waiting so that 응답이 오는 중임을 안다.
15. As an interpreter, I want my personal name and contact info to never be sent to OpenAI so that 개인정보가 보호된다.
16. As an interpreter, I want regeneration after editing 핵심 필드(품목·목적·바이어 등) to start a fresh pool so that 변경된 정보가 새 답변에 반영된다.
17. As an interpreter, I want regeneration after editing 부수 필드(만족도·금액 등) to keep the same pool so that 자잘한 수정마다 새 풀이 만들어지지 않는다.
18. As an admin, I want a `AI 자동 답변 사용 현황` card on the event dashboard so that 운영 중 호출 추세를 안다.
19. As an admin, I want the card to show 오늘 호출수 / 실패율 / 누적 비용 / 풀 캐시 hit율 so that 4가지 핵심 지표를 한눈에 본다.
20. As an admin, I want the card to use 수평바 (파이차트 금지 룰) so that 디자인 일관성을 유지한다.
21. As an admin, I want the card to refresh every 30s so that 실시간성·서버 부담의 균형이 맞다.
22. As an admin, I want LLM failures to surface in the admin card (not in interpreter UI) so that 폴백 발생을 운영자만 인지하고 통역사 작업 흐름은 보호한다.
23. As an admin, I want the consultation_detail content to be locked into specific system fields (industry, consultation_content, key_discussion, expected_amount, buyer_reaction, follow_up, notes) so that AI prompt 가 누락 필드 없이 동작한다.
24. As an admin, I want to edit the label of system fields (한글 표시명) but not their key/type so that 운영 유연성과 AI 호환성을 동시에 갖는다.
25. As an admin, I want a kill switch (`AI_AUTO_ANSWER_ENABLED=false`) so that 법적 이슈·비용 폭증 시 즉시 비활성화할 수 있다.
26. As an admin, I want per-interpreter rate limit (분당 10회) so that abuse 를 차단한다.
27. As an admin, I want per-event daily cost cap ($10) so that 비정상 비용 누적을 차단한다.
28. As an admin, I want the existing `auto_answer_template` and 조사 DSL to remain available as fallback so that LLM 장애 시에도 답변이 끊기지 않는다.
29. As an admin, I want all LLM calls logged with prompt content, token counts, cost, status, error message so that 디버깅·분쟁 대비가 가능하다.
30. As an admin, I want pool data retained for 6 months after event end so that 분쟁·검증·재출력 시 활용 가능하다.
31. As an admin, I want only interpreters (not admins, not buyers) to call the AI endpoint so that 권한이 명확하다.
32. As an admin, I want the admin dashboard card to only be visible to admins (not interpreters) so that 내부 운영 지표가 노출되지 않는다.
33. As an admin, I want the existing 양식 편집기에서 `auto_answer_template` 칸의 라벨이 "LLM 실패 시 폴백 답변" 으로 명확화되도록 so that 운영자가 두 시스템의 관계를 이해한다.
34. As a 주최측, I want 개인정보처리방침에 OpenAI(미국) 위탁 사실이 명시되어 있어야 하므로 출시 전 변호사 검토에 포함되어야 한다.
35. As a 주최측, I want OpenAI API 호출 시 `OpenAI-Beta: no-training` 헤더가 적용되어 데이터가 학습에 사용되지 않도록 보장한다.
36. As a 주최측, I want 매뉴얼에 AI 답변 생성 기능과 데이터 처리 정책이 안내되어 통역사가 사용 전 인지하도록 한다.
37. As an interpreter, I want the auto-generated answer to be inserted into the existing `consultation_detail` field (not a new field) so that 기존 워크플로가 그대로 유지된다.
38. As an interpreter, I want the answer length to be 3-6 sentences so that 보고문 분량이 적절하다.
39. As an interpreter, I want 금액·일정·성과 정보가 답변에 자연스럽게 포함되도록 so that 추가 작성 부담이 없다.
40. As an interpreter, I want "이번 상담에서는", "논의하였다", "협의가 이루어졌다" 같은 비즈니스 표현이 사용되도록 so that 공식 문서 톤이 유지된다.
41. As an interpreter, I want the answer to never use 과장된 표현 so that 신뢰성이 유지된다.

## Implementation Decisions

### LLM 제공자·모델

- 제공자 = OpenAI, 모델 = `gpt-4o-mini` ($0.15/$0.60 per 1M tok)
- HTTP 헤더: `OpenAI-Beta: no-training` 적용 — API 데이터가 학습에 사용되지 않음
- 환경변수: `OPENAI_API_KEY` (운영/스테이징 분리), `AI_AUTO_ANSWER_ENABLED` (kill switch, 기본 true)
- 호출당 평균 ~$0.0003, 행사당 ~$2 예상

### 시스템 프롬프트 (확정)

매 호출 공통으로 들어가는 시스템 프롬프트는 사용자가 직접 작성한 다음 내용을 그대로 사용한다 (prompt caching 적용):

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
2. 문체는 공공기관 제출용 문체로 작성한다.
3. 매 요청마다 문장 순서와 어투를 조금씩 변경하여 자연스럽게 작성한다.
4. "이번 상담에서는", "논의하였다", "협의가 이루어졌다" 등의 비즈니스 표현을 활용한다.
5. 분량은 3~6문장 수준으로 작성한다.
6. 너무 과장된 표현은 사용하지 않는다.
7. 사용자가 제공한 금액, 일정, 성과는 자연스럽게 문장 안에 포함한다.
8. 계약 가능성, 샘플 진행, 후속 미팅 등은 실제 무역상담회 결과처럼 현실적으로 작성한다.
9. 매번 동일한 패턴 반복 없이 주어·서술어·도입부를 변경한다.
10. 출력은 바로 제출 가능한 완성형 문장만 출력한다.
```

### 다양화 메커니즘 (5-variant)

| variant_index | temperature | 추가 힌트 |
|---|---|---|
| 0 | 0.7 | (없음) |
| 1 | 0.85 | (없음) |
| 2 | 1.0 | (없음) |
| 3 | 0.85 | "직전 시안과 도입부 어순 다르게" |
| 4 | 0.95 | "직전 시안과 결론부 표현 다르게" |

### 5-pool 캐시

- 키 = `(consultation_id, context_hash)`
- `context_hash` = `sha256(buyer_id + seller_id + value(consultation_item) + value(consultation_purpose))` 의 처음 16자
- 핵심 필드(품목·목적·바이어·셀러) 변경 시 새 풀 시작
- 부수 필드(금액·만족도·기타) 변경 시 동일 풀 유지
- 풀 사이즈 < 5 → 신규 LLM 호출, variant_index = 현재 사이즈
- 풀 사이즈 = 5 → LLM 호출 없이 `pool[(last_returned_index + 1) % 5]` 반환
- 풀 보관 기간 = 행사 종료일 + 6개월 (cron 또는 수동 정리)

### 시스템 필드 강제 (마이그 043 패턴 확장)

다음 7개 system_key 를 양식 템플릿에 강제 주입:

| system_key | 라벨 기본값 | 타입 |
|---|---|---|
| `industry` | 국내기업 업종/주요품목 | text |
| `consultation_content` | 상담내용 | textarea |
| `key_discussion` | 주요 논의사항 | textarea |
| `expected_amount` | 예상 계약금액 (USD) | text |
| `buyer_reaction` | 바이어 반응 | textarea |
| `follow_up` | 후속 계획 | textarea |
| `notes` | 기타 특이사항 | textarea |

기존 `ensureSystemFields` 헬퍼(마이그 043) 에 위 7종을 추가한다. 운영자는 양식 편집기에서 표시 라벨만 한글 변경 가능, `system_key`/`type` 은 잠금.

### API 컨트랙트

```
POST /api/ai/auto-answer
Body: {
  consultation_id: uuid,
  form_data: { [field_key]: string }  // 현재 통역사가 작성 중인 폼 스냅샷
}
Response: {
  variant_index: 0..4,
  pool_size: 1..5,
  content: string,
  source: 'llm' | 'template_fallback'
}
Errors:
  401 — 미인증
  403 — interpreter role 아님 / 본인 배정 consultation 아님
  429 — 분당 10회 초과 / 일일 $10 초과 (폴백 응답 동봉)
  503 — kill switch off (폴백 응답 동봉)
  504 — 타임아웃 (폴백 응답 동봉)
```

429/503/504 응답 시에도 `content` 는 폴백 답변을 포함한다 (통역사 화면은 항상 답변 받음).

### Rate limit / 비용 상한 / 타임아웃

- 타임아웃: 10초 (클라이언트·서버 양쪽)
- 분당 호출: user_id 기반 sliding window 10회/min
- 행사당 일일 비용: `SUM(ai_call_logs.cost_usd WHERE event_id = ? AND created_at::date = today) > 10` 시 폴백
- 폴백 트리거 7종: 타임아웃, HTTP 5xx, HTTP 429, 분당 한도, 일일 상한, kill switch off, LLM 응답 비정상(빈 문자열·parse 실패)

### 모듈 분해

- **M1 마이그 046** — `ai_answer_pool` 테이블 + `ai_call_logs` 테이블 + `system_template_fields` 7종 추가 + RLS (interpreter = 본인 호출만, admin = 조회만)
- **M2 prompt builder** (deep, pure function) — `(seller, buyer, form_data, system_fields, variant_index) → { system, user, temperature }`
- **M3 OpenAI client** (deep, mockable) — fetch 래퍼, no-training 헤더, 타임아웃 10s, 응답 파싱·검증
- **M4 폴백 어댑터** — LLM 실패 시 기존 `renderAutoAnswer()` 호출, `source: 'template_fallback'` 라벨 부착
- **M5 5-pool 매니저** (deep) — `context_hash` 계산, 풀 조회/추가/순환 인덱스 계산
- **M6 rate limit + 일일상한** (deep) — sliding window 카운터, 일일 SUM 체크
- **M7 API endpoint** — `POST /api/ai/auto-answer` orchestrate M2~M6 + `ai_call_logs` 기록
- **M8 통역사 UI** — 버튼·spinner·`시안 N/5` chip·덮어쓰기 경고·풀 한도 토스트·360px 반응형
- **M9 admin 모니터링 카드** — `/admin/events/[id]/dashboard` 4수치 수평바 카드, 30초 캐시, admin RLS
- **M10 매뉴얼 + 처리방침** — `MANUAL.md` 갱신, 스크린샷 4종, 처리방침 OpenAI 위탁 절 추가, 양식 편집기 `auto_answer_template` 칸 라벨 변경

### 스키마 변경

```sql
-- ai_answer_pool
CREATE TABLE ai_answer_pool (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations(id) on delete cascade,
  context_hash text not null,
  variant_index smallint not null check (variant_index between 0 and 4),
  content text not null,
  temperature numeric(3,2),
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(10,6),
  created_at timestamptz not null default now(),
  unique(consultation_id, context_hash, variant_index)
);
CREATE INDEX ai_answer_pool_consult_hash ON ai_answer_pool(consultation_id, context_hash);

-- ai_call_logs
CREATE TABLE ai_call_logs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid references consultations(id) on delete set null,
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id),
  model text not null,
  status text not null,  -- 'success' | 'timeout' | 'http_5xx' | 'rate_limit' | 'kill_switch' | 'daily_cap' | 'invalid_response' | 'template_fallback'
  prompt_text text,  -- 평문 저장 (Q11 B 결정)
  completion_text text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric(10,6),
  error_message text,
  created_at timestamptz not null default now()
);
CREATE INDEX ai_call_logs_event_created ON ai_call_logs(event_id, created_at);
CREATE INDEX ai_call_logs_event_date_status ON ai_call_logs(event_id, (created_at::date), status);

-- system_template_fields 추가 (마이그 043 ensureSystemFields 확장)
-- key: industry, consultation_content, key_discussion, expected_amount, buyer_reaction, follow_up, notes
```

### RLS 정책

- `ai_answer_pool` — interpreter 는 본인 배정 consultation 만 select, admin 은 본인 행사 select. insert = service_role 만 (API 경유).
- `ai_call_logs` — admin 은 본인 행사 select. interpreter 는 select 불가. insert = service_role 만.

### 보안·개인정보

- 송신 항목: 회사명(seller·buyer)·국가·양식 7개 시스템 필드값
- 송신 제외: 개인 성명(buyer_name, seller.contact_name)·전화·이메일
- 처리방침 추가 절: "AI 자동 답변 생성을 위해 OpenAI(미국)에 회사명·상담 내용을 위탁 송신합니다. OpenAI 데이터 처리정책 링크." (변호사 검토 시 함께 반영)
- 매뉴얼 안내: 통역사·주최측 매뉴얼에 데이터 처리 정책 1절 추가

### 의존 그래프 (슬라이스)

```
S0(마이그+env+시스템필드) → S1(M2+M3+M4 lib) → S2(M5+M6+M7 API) → S3(M8 통역사 UI) ┐
                                                              └→ S4(M9 admin 카드) ┴→ S5(매뉴얼+처리방침)
```

## Testing Decisions

### 좋은 테스트 기준

- 외부 동작만 검증 (구현 세부사항 X)
- prompt builder = 입력 → 출력 (스냅샷 + 시스템 필드 누락 케이스)
- 5-pool = 캐시 키 결정성·순환 인덱스·풀 가득 시 동작
- rate limit = 경계 조건 (분당 10번째·11번째, 일일 $9.99·$10.01)
- API 통합 = OpenAI mock 후 7가지 폴백 트리거 전부 시나리오
- LLM 출력 자체 검증은 X (확률적, 회귀 비결정성). 길이 범위(3-6문장)·금지 표현 정도만 sanity check

### 테스트 모듈

- **M2 prompt builder** — 단위 테스트
  - 시스템 필드 7종 모두 있을 때 → user message 에 모두 포함
  - 일부 system_key 값 비어있을 때 → "(정보 없음)" 또는 생략
  - variant_index 0~4 → temperature·힌트 매핑 정확
  - 시스템 프롬프트 정확히 사용자 제공 텍스트와 일치 (스냅샷)
- **M3 OpenAI client** — 단위 테스트 (fetch mock)
  - `OpenAI-Beta: no-training` 헤더 포함
  - 10s 타임아웃 trigger 검증
  - HTTP 5xx → throw
  - HTTP 429 → throw 특정 에러
  - 응답 빈 문자열 → throw
- **M5 5-pool 매니저** — 단위 테스트
  - 동일 핵심 필드 → 동일 context_hash
  - 핵심 필드 변경 → 다른 context_hash
  - 부수 필드 변경 → 동일 context_hash
  - 풀 0→1→2→3→4→5 사이즈 증가, 5 도달 시 호출 없이 순환
  - 6번째 클릭 = pool[1] 반환, 7번째 = pool[2], 10번째 = pool[0]
- **M6 rate limit** — 단위 테스트
  - sliding window 1분 경계
  - 일일 SUM $9.99 = 통과, $10.01 = 폴백
- **M7 API endpoint** — 통합 테스트 (OpenAI mock)
  - 7가지 폴백 트리거 전부 (timeout/5xx/429/min cap/day cap/kill switch/invalid response)
  - 5-pool 순환 시나리오 6번 호출 = 5 LLM 호출 + 1 캐시 hit
  - 인증·권한 (admin 호출 = 403, 타인 consultation = 403)
- **M9 admin 카드** — 통합 테스트
  - admin RLS (interpreter 호출 = 403)
  - 30초 캐시 hit 검증
  - 4수치 계산 정확성

### Prior art

- `src/test/__tests__/scheduled-notice-migration.test.ts` (마이그 단위, M1 참조)
- `src/test/__tests__/scheduled-notice-rpc.integration.test.ts` (RPC 통합, M7 참조)
- `src/lib/template/__tests__/autoAnswer.test.*` (기존 템플릿 치환 테스트 패턴, M2/M4 참조)

## Out of Scope

- OpenAI 외 다른 LLM 제공자 지원 (Claude/Gemini/한국 LLM)
- 양식별 톤 커스터마이즈 (auto_answer_template 을 시스템 프롬프트 힌트로 흡수)
- admin 일괄 생성 (행사 전체 미완성 상담일지 한 번에 AI 생성)
- 통역사별 사용량 분석 페이지 / 글로벌 행사 비교 페이지
- 답변 만족도 평가 (👍👎) 수집
- 한국어 외 다국어 답변 생성
- 답변 vector embedding 기반 "비슷한 시안 reject" 자동화
- 음성 입력 → 텍스트 → 답변 생성
- 처리방침·동의서 변호사 검토 자체 (별도 일정, 메모리 `project_legal_compliance` 트랙)
- `auto_answer_template` 컬럼 제거 (폴백 보존 결정으로 유지)
- `ai_call_logs.prompt_text` 평문 저장의 암호화·익명화 (Q11 B 결정, 평문 그대로)
- 풀 보관 6개월 만료 후 자동 삭제 cron (수동 SQL 또는 후속 PRD)

## Further Notes

### 출처

회의 원문 `input/상담회 관련 회의 내용.txt` §7.2 "상담일지 및 AI 자동 답변 기능". 시연 일자 2026-05-28.

### 마이그 번호

- 043 = 운영 적용 완료 (상담일지 시스템 필드 잠금)
- 044 = PRD #16 (통역사 관리) 예약
- 045 = PRD #18 (공지 토스트) 예약
- **046 = 본 PRD (AI 자동 답변)** ← S0
- 040/041/042 = 메시지 예약 PRD #10 의 잔여, S0 시작 전 운영 반영 필요

### 사용자 결정 트리 (Q1~Q14)

본 PRD 의 14개 핵심 결정은 grill-me 인터뷰 (2026-05-29) 를 통해 사용자와 1:1 확정.

| Q | 결정 |
|---|---|
| Q1 | A — LLM 도입 |
| Q2 | gpt-4o-mini |
| Q3 | B — 단일 [AI 답변 생성] 버튼, 재생성 무제한 |
| Q4 | C — `(consultation_id, hash(buyer_id+seller_id+품목+목적))` 캐시 키 |
| Q5 | B — 컨텍스트 = 회사명·국가·양식 필드 (개인명/연락처 제외) |
| Q6 | B — LLM 실패 시 기존 템플릿 치환 폴백 (`auto_answer_template` 보존) |
| Q7 | C — temperature 변동 + variant_index 힌트 + 사용자 제공 시스템 프롬프트 |
| Q8 | A — 시스템 필드 7종 강제 (마이그 043 패턴 확장) |
| Q9 | A — 통역사만 호출, admin 호출 불가 |
| Q10 | A — 이벤트 대시보드 카드 1장 (4수치 수평바) |
| Q11 | B — 처리방침 1줄 갱신 + ai_call_logs prompt 평문 저장 |
| Q12 | 타임아웃 10s / 분당 10회 / 일일 $10 / 폴백 7종 / 풀 6개월 보관 |
| Q13 | 시안 N/5 chip / 폴백 시 통역사 알림 X / 360px 반응형 |
| Q14 | S0~S5 6슬라이스 분해 |

### 운영 룰 준수

- DB 컬럼명 영어 snake_case, enum/표시값 한글 ✓
- 영어 더미 데이터 금지 ✓
- 파이차트 금지 (수평바 사용) ✓ (admin 카드)
- 모바일 360px 반응형 필수 ✓
- MANUAL.md + manual-screenshots/ 동기 갱신 ✓ (S5)
- Codex 검수 필수 ✓ (각 슬라이스 종료 시)
- tsc clean 필수 ✓
- 로컬 dev (시드 데이터) 자가 검증 후 보고 ✓
- 마이그는 항상 수동 db push + 검증 ✓

---

## 결정사항 보강 (2026-06-05 설계 세션)

마이그 046 운영 적용 후 양식 실데이터 검토로 추가 결정 7건. 본문 Implementation Decisions 보강.

### D1 — 시스템 프롬프트 수정 (10규칙 → 12규칙)

원안 10규칙 + 다음 2 규칙 추가, 규칙 2/5 미세 수정:

- 규칙 2 수정: "문체는 공공기관 제출용 문체, **한국어로** 작성한다"
- 규칙 5 수정: "분량은 3~6문장, **한 문단으로** 작성한다"
- **규칙 11 신규**: "입력값이 `(미입력)` 인 항목은 답변에서 언급하지 않는다"
- **규칙 12 신규**: "제공된 [입력 정보] 외의 사실·수치·일정·고유명사를 추측·창작하지 않는다"

이유:
- 11 = 통역사가 양식 일부만 채울 때 AI 가 가짜 수치/일정 창작 위험 차단
- 12 = 할루시네이션 차단 (정부 제출 보고서 신뢰성)

### D2 — user message 포맷 = label:value 줄별

```
국내기업명: 라이온코리아
국내기업 업종 또는 주요품목: 화장품 OEM
해외바이어명: ACME Corp
국가: 미국
상담내용: 스킨케어 라인 공급 협의
주요 논의사항: MOQ 5000개, FOB 부산
예상 계약금액: USD 120,000
바이어 반응: 긍정적, 샘플 요청
후속 계획: 6월 중 샘플 발송
기타 특이사항: 동남아 확장 관심
```

빈 값은 `(미입력)`. JSON/자유형 대비 한국어 reasoning 안정.

### D3 — industry 데이터 출처: 양식 기존 필드 활용 (시스템 필드 폐기)

운영 양식 2개 검토 결과:

| 046 시스템 필드 | 양식 A 기존 키 | 양식 B 기존 키 | 결정 |
|---|---|---|---|
| `industry` | `상담품목` | `consultation_item` (required) | **폐기**, 양식 기존 키 사용 |
| `consultation_content` | `상담세부내용` | `consultation_detail` (required) | **폐기**, 양식 기존 키 사용 |
| `expected_amount` | `수출상담액_USD`, `계약추진액_USD` | `export_amount_usd`, `contract_planned_usd` | **폐기**, 양식 기존 키 사용 |
| `key_discussion` | (없음) | (없음) | **유지** (시스템 잠금) |
| `buyer_reaction` | (없음, `매칭만족도` 다른 의미) | `buyer_satisfaction` 다른 의미 | **유지** (시스템 잠금) |
| `follow_up` | (없음) | (없음) | **유지** (시스템 잠금) |
| `notes` | (없음) | (없음) | **유지** (시스템 잠금) |

→ 마이그 046 의 3종 시스템 주입 = **운영 양식에 row 그대로 둠**. 마이그 048 미작성. prompt builder fallback 으로 빈 값 해결.

근거: 048 작성 비용/리스크 > 양식 빈 칸 3개 UI 부담. 추후 양식 정리 시 한꺼번에.

### D4 — prompt builder 양식 키 후보 fallback

각 입력 항목별 양식 키 후보 리스트 순회, 첫 비어있지 않은 값 사용:

| prompt 입력 항목 | fallback 순서 |
|---|---|
| 국내기업명 | `sellers.company_name_kr` → `sellers.company_name` |
| 국내기업 업종/주요품목 | `consultation_item` → `상담품목` → `industry` → `sellers.extra_info->>'업종'` → `sellers.extra_info->>'품목'` |
| 해외바이어명 | `buyers.company_name` |
| 국가 | `buyers.country` |
| 상담내용 | `consultation_detail` → `상담세부내용` → `consultation_content` |
| 주요 논의사항 | `key_discussion` (시스템 잠금 유지) |
| 예상 계약금액 | `contract_planned_usd` → `계약추진액_USD` → `expected_amount` |
| 바이어 반응 | `buyer_reaction` (시스템 잠금 유지) |
| 후속 계획 | `follow_up` (시스템 잠금 유지) |
| 기타 특이사항 | `notes` (시스템 잠금 유지) |

신규 양식 추가 시 매핑 갱신 비용 = 새 키 1~2개 추가. 운영 부담 적음.

### D5 — sellers `업종` prefill (B 변형)

엑셀 업로드 EXTRA_LABELS 에 "업종" 키워드 추가 (`src/lib/excel/users-parser.ts:55-58`). 셀러 상세에서 `sellers.extra_info->>'업종'` 으로 양식 prefill (구현 시 결정).

이미 "품목", "상담회 품목" 은 EXTRA_LABELS 포함됨.

### D6 — 캐시 키 = K1 (consultation_id 만)

PRD 본문 §4 의 `(consultation_id, sha256(buyer_id+seller_id+consultation_item+consultation_purpose)[:16])` 원안 **폐기**.

| 옵션 | 풀 키 | 새 풀 생성 시점 | 비용 |
|---|---|---|---|
| K1 (채택) | `consultation_id` 만 | 절대 안 바뀜 | 최저 (LLM 호출 ≤ 5회/상담) |
| K2 | `(buyer_id, seller_id)` | 다른 조합 | 낮음 |
| K3 (원안) | 추가 양식 해시 | textarea 1글자 수정 시 신규 | 높음 |

이유:
- 한 상담 = 한 풀 = 단순/안정/저비용
- textarea 1글자 변경마다 풀 깨지면 비용 폭증
- "핵심 필드 변경 시 새 풀" 원안 UX 의도는 통역사 측 "다른 시안 보기" 인데, 5-variant 풀 자체로 해결

마이그 046 의 `ai_answer_pool.context_hash` 컬럼은 그대로 두고, K1 에서는 상수값 (`'v1'` 등) 으로 채움.

### D7 — 불참 가드 UI 레벨 1줄

`MultiStepReportForm.tsx:89-100` 이미 `isAbsentFlow` 분기 → 불참 시 양식 필드 자동 숨김. AI 버튼도 동일 위치라면 자동 숨김.

추가 안전망: AI 버튼 위치에 따라 `disabled={isAbsentFlow}` 1줄 가드.

→ 시스템 프롬프트에 불참 처리 규칙 추가 **불필요**. 양식 자체가 가려져서 user msg 에 빈 값만 들어가고, D1 규칙 11 이 무시 처리.

---

### 다음 슬라이스 영향

- **S0 (마이그 046)** = 운영 적용 끝. 추가 마이그 048 미작성.
- **S1 (M2 prompt builder + M3 OpenAI client + M4 폴백)** = D1/D2/D4 반영. fallback 매핑 상수 + label:value 포맷 + 12규칙 시스템 프롬프트.
- **S2 (M5 5-pool + M6 rate limit + M7 API)** = D6 (K1 캐시) 반영. context_hash 상수.
- **S3 (M8 통역사 UI)** = D7 (isAbsentFlow disable) + D5 (industry prefill UI) 반영.
- **S5 (매뉴얼+처리방침)** = 변경 없음.
