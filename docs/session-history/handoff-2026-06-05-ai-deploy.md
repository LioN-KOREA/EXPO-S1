# Handoff — PRD #19 AI 자동 답변 운영 배포 (2026-06-05 ai-deploy)

## 컨텍스트

직전 (`handoff-2026-06-05-ai-poc.md`) = PoC 코드 + commit + 운영 push 까지. 본 세션 = 운영 활성화 (사용자 팀장 보고 시연 목적) + secret 매핑 + 5번 카운터 안전망 + 폴백 UI 숨김 + 평어체 규칙 강화. 사용자 시연 합격.

## 운영 현재 상태

**활성화 완료**:
- GH Actions secret `OPENAI` (사용자 등록, OpenAI API 키)
- GH Actions secret `AI_AUTO_ANSWER_ENABLED='true'` (claude `gh secret set` 으로 등록)
- 워크플로 env: `OPENAI_API_KEY: ${{ secrets.OPENAI }}` 매핑 (이름 다름 회피)
- Lambda env: `OPENAI_API_KEY`, `AI_AUTO_ANSWER_ENABLED` 둘 다 주입됨 (Pulumi)

**운영 동작**:
- 통역사 상담일지 → "상담세부내용" 단계 → `AI 답변 생성 (N/5)` 버튼
- 1~5번 클릭 = LLM 새 호출 (variant 0~4 순환), 비용 회당 ~$0.0002
- 6번째 = 버튼 disable + 라벨 `5개 시안 모두 생성됨`
- 페이지 새로고침 시 카운터 reset

## 본 세션 추가 commit (6개)

| commit | 내용 |
|---|---|
| `b4d823f` | PoC 3 파일 + UI 임시 연동 + 설계 보강 + 핸드오프 (직전 세션 push) |
| `0bb6ae4` | 워크플로 + infra/frontend.ts env wiring |
| `26e18b4` | 5번 클라이언트 카운터 안전망 |
| `75b6c9d` | 폴백 템플릿 carded → collapsible 숨김 (양식 편집기) |
| `843467e` | secret 이름 매핑 `OPENAI` → `OPENAI_API_KEY` 환경변수 |
| `5cd01a2` | 평어체 강제 (규칙 2 강화) + 보고 행위 묘사 금지 (규칙 13 신규) |

## 시스템 프롬프트 = 13 규칙 (최종)

규칙 2 강화 + 규칙 13 신규:
- 규칙 2: "공공기관 제출용 **평어체**로 작성. 종결어미 `-한다/-이다/-되었다/-였다` 만 사용"
- 규칙 13: 경어체 (`-드린다/-드립니다/-습니다/-요`) + 보고 행위 묘사 (`알려드린다/보고드린다/안내드린다`) 금지

## 양식 편집기 변경

- 자동 답변 템플릿 Card → `<details>` collapsible 로 감쌈
- summary = "고급 — LLM 실패 시 폴백 답변 템플릿 (평소 숨김)"
- 카드 제목 + 안내 문구도 "LLM 실패 시 폴백" 으로 명확화
- 평소 진입 시 시야 깔끔, 펼쳐야 노출

## PRD 결정 확인

- 폴백 (`auto_answer_template` + `renderAutoAnswer`) = **유지**. PRD Out of Scope + §33 라벨 명확화 결정대로.
- 사용자 검토 후 "PRD 결정 따라가자" 합의.

## 잔여 작업

| 우선 | 항목 | 비고 |
|---|---|---|
| 중 | S2 M5 5-pool DB 캐시 (`ai_answer_pool` 활용) | 정식 — 6번째+ 캐시 반환, 비용 통제 |
| 중 | S2 M6 rate limit (분당 10, 일일 $10) | sliding window + SUM 체크 |
| 중 | S2 M7 `ai_call_logs` 인서트 (prompt 평문 저장) | admin 모니터링 + 분쟁 대비 |
| 중 | S1 M4 폴백 어댑터 정식 연결 | LLM 실패 시 `renderAutoAnswer` 호출 |
| 중 | S4 M9 admin 카드 (`/admin/events/[id]/dashboard`) | 수평바 4수치 30초 캐시 |
| 중 | S1 Vitest 단위 (prompt-builder 스냅샷, variant, fallback) | 회귀 안전망 |
| 중 | S1 Codex 검수 1회 | 운영 룰 |
| 저 | `/api/ai/test` → `/api/ai/auto-answer` 라우트 정리 | 이름 통일 |
| 저 | PoC `consultationId?: string` optional → 정식 required | 타입 견고화 |

## 사용자 액션 (시연 후)

- **OpenAI 키 폐기 권장** (세션 중 채팅 2회 노출). GH secret 도 갱신 필요.
- AI 끄려면: GH secret `AI_AUTO_ANSWER_ENABLED` 값을 `false` 로 변경 + 빈 commit + push 또는 secret 삭제 + 재배포.
- 운영 비활성화 권장 시점 = 팀장 보고 직후 (비용 통제).

## PoC 시 사용자 검증 요약

- 답변 품질 자연스러움 ✅ ("마음에 든다")
- 12 규칙 준수 (보고문 톤, 3-6 문장, 한 문단) ✅
- variant 0~4 다양화 ✅
- 양식 키 fallback (시드 `consultation_product`/`consultation_detail`/`contract_push_amount`) ✅
- 응답 시간 = ~2.4초 / 회당 비용 = ~$0.0002
- 평어체 위반 발견 → 규칙 2/13 강화로 대응

## 운영 룰 준수

- 코딩 후 Codex 검수 = PoC 라 생략 (정식 S1 에서 필수)
- 큰 변경 보고 = 본 핸드오프 + 직전 2건
- 파괴적 작업 = 0
- 마이그 = 0 (046 까지 그대로)
- 메모리 동기 갱신 = `project_ai_auto_answer.md` ✅
- 세션 히스토리 = 본 파일 ✅
- AI_AUTO_ANSWER_ENABLED kill switch = 기본 false 설계, 사용 시만 true (정상)

## 참조

- 직전 세션 (PoC): `handoff-2026-06-05-ai-poc.md`
- 직전 직전 (설계): `handoff-2026-06-05-ai-design.md`
- PRD 본문: `docs/prd/PRD-19-ai-auto-answer.md` (D1~D7 보강)
- 관련 코드: `src/lib/ai/prompt-builder.ts`, `src/lib/ai/openai-client.ts`, `src/app/api/ai/test/route.ts`, `src/components/interpreter/MultiStepReportForm.tsx`, `src/app/admin/events/[id]/template/TemplateEditor.tsx`
- 인프라: `.github/workflows/deploy-prod.yml`, `infra/frontend.ts`
