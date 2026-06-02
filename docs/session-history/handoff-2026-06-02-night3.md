# Handoff — EXCON 수출상담회 (2026-06-02 night3, PRD #16 S0 슬라이스 #21)

## 세션 핵심

PRD #16 (통역사 관리 메뉴) 슬라이스 S0 (#21) 완료. 마이그 044 + types + repository + 정적/통합 테스트 + Codex 검수.

| 항목 | 상태 | 비고 |
|---|---|---|
| 마이그 044 | ✅ | interpreter_global_meta + interpreter_evaluations + RPC |
| types | ✅ | InterpreterGrade/RehireStatus/GlobalMeta/Evaluation/EventParticipation/WithHistory |
| repository 4 함수 | ✅ | listInterpreters / getInterpreterWithHistory / upsertEvaluation / updateGlobalFields |
| 마이그 정적 테스트 | ✅ 20/20 |
| 통합 테스트 | ✅ 20/20 (rehire_status 케이스 추가 후) |
| Codex 검수 | ✅ BLOCK 0, WARN 3 (1·3 반영) |

## 1. 설계 변경 (PRD #16 본문 → 본 슬라이스)

PRD 본문은 profiles 4 컬럼 추가 명시. 본 슬라이스에서 **별도 테이블 `interpreter_global_meta` 로 분리** (사용자 컨펌, 옵션 A 선택).

**왜**: Postgres column-level REVOKE 가 table-level GRANT 와 충돌하여 무효. profiles 의 기본 `GRANT SELECT TO authenticated` 가 컬럼 REVOKE 를 덮어써, 통역사 self-select 가 차단되지 않음. PRD US18 (admin-only 노출) 위배 위험.

**대안**: 별도 테이블 + row-level RLS admin-only. profiles 변경 없음 → US20 (admin/users 기존 동작) 영향 0.

## 2. 산출물

### 마이그 044 (`supabase/migrations/044_interpreter_management.sql`)
- `interpreter_global_meta(interpreter_id PK FK profiles, grade, base_rate, rehire_status, global_notes, created_at, updated_at)`
  - 한글 enum CHECK + 음수 금지 + admin-only RLS 4 정책 + updated_at 트리거
- `interpreter_evaluations(id, interpreter_id FK, event_id FK, comment, notes, paid_rate, evaluated_by FK, evaluated_at, created_at, updated_at)`
  - UNIQUE(interpreter_id, event_id) + paid_rate ≥ 0 + admin-only RLS 4 정책 + 인덱스 (interpreter_id), (event_id) + updated_at 트리거
- `update_interpreter_global_fields(p_id, p_grade, p_base_rate, p_rehire_status, p_global_notes)` RPC
  - SECURITY DEFINER + search_path 고정
  - caller_role admin 검증 (RAISE 42501)
  - target role=interpreter 검증
  - enum/음수 검증
  - meta upsert (ON CONFLICT interpreter_id)
  - REVOKE PUBLIC + GRANT authenticated

### types (`src/types/index.ts`)
- Profile 변경 없음
- 신규: `InterpreterGrade`, `InterpreterRehireStatus`, `InterpreterGlobalMeta`, `InterpreterEvaluation`, `InterpreterEventParticipation`, `InterpreterWithHistory`

### repository (`src/lib/interpreter/repository.ts`)
- `listInterpreters({ search, gradeFilter, rehireFilter })` — profiles + meta + events + 평가 카운트 집계. grade/rehire 필터는 in-memory (meta 없는 통역사 누락 방지).
- `getInterpreterWithHistory(id)` — 프로필 + meta + 참여 이벤트 + 평가 풀
- `upsertEvaluation({ interpreterId, eventId, comment, notes, paidRate, evaluatedBy })` — 사전 배정 검증 + UNIQUE 활용 upsert
- `updateGlobalFields(supabase, id, input)` — RPC 래퍼. **admin 인증 client 필수** (RPC 가 auth.uid() 기반).

### 테스트
- `src/test/__tests__/interpreter-migration.test.ts` — 정적 20 케이스 (idempotent / RLS / enum / index / 트리거 / RPC SECURITY / REVOKE-GRANT / profiles 변경 없음)
- `src/test/__tests__/interpreter-repository.integration.test.ts` — 통합 20 케이스 (RLS admin-only / upsert TOCTOU / RPC enum 5 케이스 / list 필터 / history join)

## 3. Codex 검수 결과

- **BLOCK 0**
- **WARN 1 반영**: updateGlobalFields 코멘트 = "service_role 사용 가능" 오류. RPC 가 auth.uid() 기반이라 service_role 호출 시 auth.uid()=NULL → admin 검증 실패. → 코멘트 정정 (admin 인증 client 필수 명시)
- **WARN 2 미반영 (후속)**: upsertEvaluation TOCTOU. event_interpreters 배정이 검증 직후 삭제되면 평가 row 생성 가능. 강한 invariant 필요 시 (event_id, interpreter_id) 복합 FK 권장.
- **WARN 3 반영**: invalid_rehire_status 통합 케이스 누락 → 추가 (20→20 통과)
- **SUGGEST 1 (후속)**: target role=interpreter DB trigger 보강 (RPC 외 직접 INSERT 대비)
- **SUGGEST 2 (후속)**: search escape — S1 UI 슬라이스에서 처리

## 4. 운영 룰 준수

- 코딩 후 Codex 검수 = 1회 ✅
- 큰 변경 보고 = 사용자 옵션 A 선택 ✅
- 파괴적 작업 = 없음
- 보안 = admin-only RLS + RPC admin 검증 + REVOKE PUBLIC ✅
- DB 컬럼명/UI 더미 = 0 (한글 enum 고정)
- 마이그 = 044 신규
- 매뉴얼 동기 = S0 = 데이터 레이어만, UI 없음 → 미적용 (S1 UI 슬라이스에서)
- 진우 핑 = 0 ✅

## 5. 후속 작업

PRD #16 슬라이스 트랙 (이슈 #26~#29):
- #26 S1: server 측 list/detail 페이지
- #27 S2: 글로벌 필드 편집 모달
- #28 S3: 평가 모달 (event interpreters 페이지)
- #29 S4: HITL 체크리스트

본 슬라이스 후속 TODO:
- WARN 2 = upsertEvaluation TOCTOU 복합 FK
- SUGGEST 1 = role=interpreter trigger
- SUGGEST 2 = S1 UI 검색 escape

## 6. 다음 세션 즉시 작업 (우선순위)

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | **PRD #10 사용자 수동 검증 + close** | 대기 | `handoff-2026-06-02-late2.md` §4 |
| 2 | PRD #16 슬라이스 S1 (#26 list/detail 페이지) | 다음 | grabbable |
| 3 | PRD #17/#18/#19 S0 (#22/#24/#25) | 미진행 | 병렬 가능 |
| 4 | 본 슬라이스 후속 TODO 3건 | 미진행 | 본 핸드오프 §5 |
| 5 | CloudFront Free→Standard | 미진행 | — |
| 6 | 변호사 검토 | 외부 | — |

## 참고

- 직전 핸드오프: `handoff-2026-06-02-night2.md`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 단위 테스트: 11 file / 114 pass
- 통합 테스트: 1 file / 20 pass
- 이슈 #21: https://github.com/LioN-KOREA/EXPO-S1/issues/21
- PRD #16: https://github.com/LioN-KOREA/EXPO-S1/issues/16
