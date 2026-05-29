# Handoff — EXCON 수출상담회 (2026-05-28 추가, 시스템 필드 강제 잠금)

## 세션 핵심

상담일지 양식 버그 수정: "국내기업 불참" / "바이어 불참" 선택해도 absence_reason 분기 미발동.

**원인**: `MultiStepReportForm` 의 `isAbsentFlow` 분기가 `consultation_type` / `absence_reason` 키를 하드코딩으로 매칭하는데, 사용자가 양식 새로 만들거나 엑셀 업로드 시 키 미일치 발생.

- `TemplateEditor.addField`: `field_${Date.now()}` 임의 키 부여
- `excel/template-parser.generateKey`: 한글 라벨 → `상담_진행_유형` 식 라벨 기반 키 부여

**해결**: 두 필드를 시스템 필드로 격상. 잠금 + 자동 보강 + 운영 데이터 정규화.

## 커밋

| 커밋 | 요약 |
|---|---|
| `0fc7486` | fix(template): consultation_type/absence_reason 시스템 필드 강제 잠금 |

`origin EXPO-S1` push 완료.

| 워크플로 | run_id | 결과 |
|---|---|---|
| CI | 26556950054 | success |
| Deploy (prod) | 26556950045 | success |

운영 반영: https://excon.wordcat.it.kr

## 변경 내역 (6 파일)

### `src/lib/template/defaults.ts`
- `SYSTEM_FIELD_KEYS = ['consultation_type', 'absence_reason']` 상수
- `SYSTEM_FIELD_CANON` — 캐논 정의 추출 (DEFAULT_TEMPLATE_FIELDS 에서)
- `isSystemFieldKey(key)` 타입 가드
- `normalizeLabel(label)` — 끝 `*` 제거 + trim
- `SYSTEM_FIELD_LABELS` Set — 라벨 기반 흡수
- `ensureSystemFields(fields)` — 비시스템만 유지 → consultation_type 맨앞 + absence_reason 맨뒤 + order 재부여

### `src/app/admin/events/[id]/template/TemplateEditor.tsx`
- 초기화 시 `ensureSystemFields(initialFields)` 적용
- `update` / `updateLabel` / `move` / `reorder` / `remove` 가드 — 시스템 필드 변경 금지
- `reorder`: `to` 인덱스 `[1, length-2]` clamp (시스템 필드 위치 보호)
- `addField`: `absence_reason` 직전 삽입
- 저장 직전 `ensureSystemFields` 재강제
- UI: locked 필드에 모든 입력 `disabled` + 잠금 뱃지 + `draggable={false}` + amber 테두리

### `src/app/admin/events/[id]/template/page.tsx`
- 양식 로드 후 `ensureSystemFields` 적용 (조회 모드에서도 일관성)

### `src/app/interpreter/events/[id]/consultation/[consultationId]/page.tsx`
- `rawFields.length > 0` 일 때만 `ensureSystemFields` 호출 (빈 폼 회귀 방지)

### `src/app/api/upload/template/route.ts`
- 엑셀 파싱 결과에 `ensureSystemFields` 강제 적용 후 저장 + 응답

### `supabase/migrations/043_ensure_system_template_fields.sql` (신규)
- **1단계**: `consultation_reports.data` 의 라벨 기반 키 → 시스템 키 rename
  - 각 template 에서 `label='상담 진행 유형'` / `label='불참 사유'` 인 비시스템 키 찾기
  - 해당 event 의 reports.data 에서 key rename (시스템 키 부재 시에만 옮김, 충돌 보호)
- **2단계**: `report_templates.fields` 정규화
  - 시스템 키 + 라벨 매칭 흡수 (`btrim(regexp_replace(label, '\s*\*+\s*$', ''))`)
  - 캐논 객체 prepend/append + order 재부여

## 운영 DB 적용 완료 (Supabase MCP)

- 마이그 등록: version `20260528053534` name `ensure_system_template_fields`
- 영향 받은 데이터:
  - `report_templates` 2건 (id `30cb3494`, `a1d794c0`)
  - `consultation_reports` 2건 (id `242fcd7e`, `2f0bf005`)
- rename 값 보존 검증:
  - `242fcd7e.consultation_type = "바이어 불참"` ✓
  - `2f0bf005.consultation_type = "현장 주선 상담"` ✓

### 4 가지 검증 통과

| 검사 | 결과 |
|---|---|
| `leftover_label_keys` (fields) | 0 ✓ |
| `templates_missing_system` | 0 ✓ |
| `leftover_data_keys` (data) | 0 ✓ |
| `reports_with_consult_type` | 2 ✓ |

## 마이그 numbering 주의

- 운영 등록 version: `20260528053534` (MCP apply_migration 자동 timestamp)
- 로컬 파일: `043_ensure_system_template_fields.sql`
- 다음 db push 시 040~042 + 043 시도. 043 내용 **idempotent** 이므로 재실행 안전:
  - 데이터 rename: 대상 키 부재 시 자동 skip
  - fields 정규화: 이미 시스템 키 있으면 캐논 덮어쓰기만

## 검수

- `npx tsc --noEmit` — clean
- Codex 정적 검수 3차례:
  - 1차: reorder 가드 미흡 / interpreter page ensureSystemFields 누락 / 중복 시스템 키 미제거 — 모두 반영
  - 2차: addField 위치 회귀 / 빈 fields ensureSystemFields([]) 회귀 — 모두 반영
  - 3차: 라벨 기반 흡수 추가 — 통과

## 잔여 untracked (이전 핸드오프와 동일, S1)

```
infra/Pulumi.e1s.yaml                    M (배포 산출물?)
output/사용자_일괄등록_테스트.xlsx       M
output/타임테이블_테스트.xlsx            M
package.json                             M (S1 test:integration)
supabase/.temp/cli-latest                M
vitest.config.mts                        M (S1 exclude)
docs/runbook/                            ?? (S1)
src/test/__tests__/scheduled-notice-migration.test.ts        ?? (S1)
src/test/__tests__/scheduled-notice-rpc.integration.test.ts  ?? (S1)
supabase/migrations/040_scheduled_notices.sql                ?? (S1)
vitest.integration.config.mts            ?? (S1)
vitest.setup.integration.ts              ?? (S1)
```

## 다음 세션 즉시 작업

| # | 항목 | 상태 |
|---|---|---|
| 0 | 시연 결과 반영 | 대기 |
| 1 | **마이그 041 + 042 운영 db push** | 미진행 (043 은 본 세션에서 적용 완료) |
| 2 | 추천 #3 createOrGetUser 모듈 (3 라우트 캡슐화) | 미진행 |
| 3 | 추천 #2 출석표 정렬 팩토리 | ✅ 완료 (직전 세션) |
| **4** | **상담일지 시스템 필드 잠금** | **✅ 완료 (이 세션)** |
| 5 | S1 untracked 산출물 정리 | 미진행 |
| 6 | PRD #10 (#12~#15) 재개 | 시연 후 결정 |
| 7 | 9건 이슈 SQL 진단 | 미진행 |
| 8 | M2 pg_cron 실패 처리 정책 | 미진행 |
| 9~11 | QR 캐시 / 배정 stale / 카메라 권한 매뉴얼 | 미진행 |
| 12 | GitHub Actions Node.js 20 → 24 워크플로 갱신 (deadline 2026-06-02) | 미진행 |

## 참고

- 직전 핸드오프: `handoff-2026-05-28-late.md`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 커밋: `0fc7486`
- Supabase project_id: `zyqmtehupckkweafzyuc` (expo-s1-e1s, Northeast Asia Seoul)
