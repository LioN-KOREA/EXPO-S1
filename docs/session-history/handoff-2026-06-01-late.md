# Handoff — EXCON 수출상담회 (2026-06-01 야간, Pulumi stack 재초기화 진행 + CloudFront drift 발견)

## 세션 핵심

직전 세션(`handoff-2026-06-01.md`) 우선순위 1 = "Stack 재초기화" 실행. **17 리소스 모두 state 흡수 완료**. 단 1차 시도에 4 HIGH/1 MEDIUM (Codex), 2차 시도에 IAM 권한 부족 (5건 fail), 3차 시도에 IAM 권한 추가 후 import 성공. 4차 시도에 Supabase Project state mismatch 로 preview fail → Supabase Project 코드 분리 + state strip 으로 해결. 최종 preview = clean **단** CloudFront 4 변경 drift 발견 → 의사결정 미정 → **deploy 미트리거**.

1. **Stack 재초기화 + 17 imported 완료** (passphrase 복구 트랙 종결)
2. **Supabase Project IaC 분리** (TF provider 의 databasePassword round-trip 불가 회피)
3. **CloudFront drift 4건 발견** = **본 세션 종결 후 다음 세션 즉시 의사결정 필요**

## 1. Stack 재초기화 시도 4회 + 권한 추가

### 1a. 로컬 stack rm + init (성공)
- 새 passphrase 생성 = `07e4558b31c1ab3650543567632eb4136b506779afbfee0df1a9843ea059c5e6` (32 byte hex random, `infra/backup-2026-06-01/new-passphrase.txt` 보존)
- `pulumi login s3://lk-cicd-pulumi` → `pulumi stack rm e1s --yes --force` → `pulumi stack init e1s --secrets-provider passphrase`
- 사전 안전망: `pulumi stack export --file infra/backup-2026-06-01/pulumi-stack-export.json` (598KB), 추가 `e1s-stack.json` + `.bak` 보존
- `gh secret set PULUMI_CONFIG_PASSPHRASE` 새 값으로 갱신
- `Pulumi.e1s.yaml` 새 encryptionsalt = `v1:JYCnC91y8hk=:v1:689RlCYoWG4NqxIO:5/9MF7zJ2JQecNLwcrsOFdEKfQdsLA==`, config 3종 (aws:region, supabaseRegion, bucketName) 복원

### 1b. 1회용 recovery-import-stack.yml workflow + Codex 검수 4회
- workflow = npm ci → build → opennext build → npm ci infra → stack select → import file=recovery/import-plan.json → preview
- Codex 1차: 4 HIGH (ssr-logs ID 형식, Supabase provider 매핑, databasePassword ignoreChanges, build steps 누락) + 1 MEDIUM (138 bucketObject 누락)
- Codex 2차: 1 HIGH (`--generate-code=false` 가 program eval skip → explicit Provider 미생성 → Project 가 default provider 로 import → 다음 deploy 시 provider replace = Supabase project 삭제 위험) → **supabase.ts 의 explicit Provider 제거, default provider 사용**
- Codex 3차: false positive (이미 init 한 stack 상태 미인지)
- Codex 4차: CLEAN

### 1c. workflow 실행 = 4번 trial
- **Run 26744855843** (1차): IAM 5건 fail = `arn:aws:sts::254689256810:assumed-role/GH_DEPLOY_APPS` 의 PowerUserAccess 정책에 `iam:GetRole`/`iam:GetRolePolicy`/`iam:ListAttachedRolePolicies` 미포함 → 403 AccessDenied. 12 imported 성공 (S3 4, DynamoDB, Supabase, Lambda 4, CloudFront, BucketPolicy)
- **AWS IAM 정책 추가** = `aws iam put-role-policy --role-name GH_DEPLOY_APPS --policy-name pulumi-import-iam-read` (Resource = account role/*, read-only)
- **Run 26745631088** (2차): IAM 5건 import 성공. 단 Preview step = `supabase:index/project:Project 'expo-s1' has a problem: Missing required property 'databasePassword'` fatal error + `synced-folder:assets-sync grpc client connection closing` 부수 에러

### 1d. Supabase Project 코드 분리 + state strip (로컬)
- 원인: TF supabase provider 가 `databasePassword` (sensitive) state 저장 못 함. `ignoreChanges` = diff 만 처리, provider schema 의 required validation 못 막음
- 해결: `infra/supabase.ts` 에서 `supabase.Project` resource + Provider declaration 제거. `projectRef = "zyqmtehupckkweafzyuc"` hardcoded, `supabaseUrl` = `https://${projectRef}.supabase.co` (string, 더 이상 `pulumi.interpolate` 아님). anonKey/serviceRoleKey 는 그대로 (env 에서 직접)
- State strip: `pulumi stack export` → `backup-2026-06-01/strip-supabase.js` (Node 스크립트, supabase URN match 모두 제거 + dependencies/propertyDependencies cleanup) → `pulumi stack import`. 20 → 18 resources
- **로컬 preview = 성공** (단 CloudFront drift 4건 = 다음 절)

## 2. CloudFront drift 4건 = **다음 세션 의사결정 필수**

`pulumi preview` 결과:
```
Resources:
    + 1 to create
    ~ 3 to update
    4 changes. 14 unchanged
```

**대규모 drift = CloudFront distribution `cdn`** (manual console 수정 또는 IaC 정의 이전 설정 추정):

| 항목 | 코드 (infra/frontend.ts) | 실제 reality | apply 시 영향 |
|---|---|---|---|
| `webAclId` | 없음 | `arn:aws:wafv2:us-east-1:254689256810:global/webacl/CreatedByCloudFront-acd334e2/8de4f0aa-5b98-4f2b-93f0-45088e5619e1` | **WAF 분리 = 보안 약화** |
| `viewerCertificate.acmCertificateArn` | 없음 (default cert) | `arn:aws:acm:us-east-1:254689256810:certificate/32b907c9-8f0d-4327-bb5c-302a036051fd` | **커스텀 도메인 사용 시 SSL 오류** |
| `priceClass` | `PriceClass_200` | `PriceClass_All` | 비용 감소 + edge 축소 (한국 운영이라면 무관) |
| `originAccessControlId` (특정 origin) | 코드 위치별 다름 | 일부 origin 에 미설정 | OAC binding 변경 |

추가 변경 (분석 필요):
- 일부 origin 의 `domainName` 변경 (S3 → Lambda URL): 코드의 origin 순서 vs reality 의 origin id 매핑 misalign 의심
- 1 create = 미분석 (preview 전체 = `infra/backup-2026-06-01/preview-full.txt` 에 저장 시도했으나 사용자 중단)

### 의사결정 매트릭스 (다음 세션 입력)

| 항목 | Apply (코드 채택) | 코드 수정 (reality 채택) |
|---|---|---|
| WAF 분리 | 보안 약화 → ❌ | `webAclId` 코드 추가 → ✅ |
| ACM cert 제거 | 도메인 의존 시 SSL fail → ❌ | `acmCertificateArn` 코드 추가 → ✅ |
| priceClass 200 | 비용 감소 → ✅ (의도) | reality `All` 유지 → 비용 |
| origin order | reality drift = apply 안전성 미검증 | 코드 origin 순서 정정 |

**다음 세션 결정 사항**:
1. WAF 어디서 설정됐나? 진우/사용자/AWS console 자동? (기억 없음 = 진우 확인 필요)
2. 커스텀 도메인 ACM cert = 어디서 발급? CloudFront 의 default `*.cloudfront.net` 만 사용 중인지? (`cdnDomain` output = `d3ckhtcgsvrhp0.cloudfront.net` = default 사용 중일 가능성)
3. priceClass = `_All` (현재 reality) 유지 vs `_200` 코드 의도 — 사용자 결정

## 3. 본 세션 산출물

### 코드 변경
- `infra/supabase.ts` = Project + Provider 제거, hardcoded projectRef, 32 → 20 줄
- `Pulumi.e1s.yaml` = 새 encryptionsalt + config 3종 복원
- `.gitignore` = `/infra/backup-*` 추가
- `.github/workflows/deploy-prod.yml` = **push trigger 임시 disable** (drift 의사결정 전까지 자동 deploy 차단). 다음 세션에서 복원
- `.github/workflows/recovery-import-stack.yml` = 신규 후 사용 후 **삭제**
- `infra/recovery/import-plan.json` = 신규 후 사용 후 **삭제**

### 커밋 (origin/EXPO-S1)
1. `072b55c` chore(infra): pulumi 스택 재초기화 + 1회용 import 워크플로 (amended)
2. `759903f` chore(infra): import-plan = IAM 5건만 (재실행용)
3. (예정) chore(infra): Supabase Project IaC 분리 + recovery workflow cleanup

### gitignored 산출물 (보존, `infra/backup-2026-06-01/`)
- `new-passphrase.txt` = 새 PULUMI_CONFIG_PASSPHRASE 평문
- `lambda-ssr.json` + `lambda-image.json` = Lambda env 평문 (Supabase anon/service-role 키 포함)
- `e1s-stack.json` + `.bak` = stack rm 직전 S3 backend snapshot (360KB 각)
- `pulumi-stack-export.json` = stack rm 직전 추가 export
- `stack-pre-supabase-strip.json` = IAM import 직후 (20 resources)
- `stack-post-supabase-strip.json` = strip 후 (18 resources, 현재 reality)
- `iam-read-policy.json` = `pulumi-import-iam-read` inline 정책 본문
- `strip-supabase.js` = state JSON manipulation 스크립트

### AWS 변경
- `GH_DEPLOY_APPS` role 에 `pulumi-import-iam-read` inline 정책 부착 (Resource = `arn:aws:iam::254689256810:role/*`, IAM read 6 action). **유지** (향후 refresh/import 가능성)

### GitHub Secret 변경
- `PULUMI_CONFIG_PASSPHRASE` 갱신 (timestamp 2026-06-01T07:38:04Z)

## 4. 다음 세션 즉시 작업 (우선순위)

| # | 항목 | 마감 | 상태 |
|---|---|---|---|
| 1 | **CloudFront drift 4건 의사결정** = WAF/cert/priceClass/origin 결정 + 코드 또는 state 정합 작업 | 운영 deploy 차단 해소 | 미진행 |
| 2 | **deploy-prod.yml push trigger 복원** (drift 의사결정 후) | drift 결정 직후 | 미진행 |
| 3 | **`pulumi up` 1회 실행** = 의사결정 후 Lambda Node 22 + OpenNext v3 등 정당한 변경 apply | 1차 deploy 검증 | 미진행 |
| 4 | GitHub Actions Node 20 → 24 (4 actions 메이저 업) | 2026-06-16 D-15 | 미진행 |
| 5 | PRD #10 (#12~#15) 메시지 예약 클라이언트 | — | 미진행 |
| 6 | 슬라이스 #21~#25 grab 결정 | — | 미진행 |
| 7 | 버그 #20 후속 S1 조사 | — | 미진행 |
| 8 | 변호사 검토 (처리방침 + 동의서) | — | 외부 |

## 5. 운영 룰 준수 (본 세션)

- 코딩 후 Codex 검수 = 4회 (workflow + supabase 분리 검수) ✅
- 큰 변경 = 사용자 보고 후 진행 (stack rm/init, IAM 정책 추가, Supabase 분리, drift 분석 보류) ✅
- 파괴적 작업 사전 확인 = stack rm, IAM put-role-policy = 모두 사용자 승인 후 ✅
- 보안: passphrase 평문 = `infra/backup-2026-06-01/` (gitignored) + 핸드오프 평문 노출 (다음 세션 회전 시 재정리 권장)
- DB 컬럼명/UI 더미 = 본 세션 변경 0 N/A
- 마이그 = 0
- 매뉴얼 동기 = 사용자 가시 기능 변경 0 N/A
- git commit/push = 2~3 커밋 ✅

## 6. 운영 상태 (변경 없음)

- 사이트 = **5/28 마지막 성공 deploy 까지 반영, 계속 동작 중** (CloudFront drift 4건 apply 안 함)
- 5/29 이후 코드 변경 (OpenNext v3, Lambda Node 22, error boundary, dead config 제거, Supabase 분리) = **여전히 운영 미반영**
- 마이그 040/041/042 = Supabase MCP 적용됨 = 정상

## 참고

- 직전 핸드오프: `handoff-2026-06-01.md`
- repo: https://github.com/LioN-KOREA/EXPO-S1 (branch `EXPO-S1`)
- 실패 workflow runs: 26731202680, 26732297238, 26732508413, 26732555306, 26732734645, 26733675215, 26734879851, 26744855843, 26745631088
- Supabase project_id: `zyqmtehupckkweafzyuc` (이제 IaC 비관리)
- 새 PULUMI_CONFIG_PASSPHRASE: `07e4558b31c1ab3650543567632eb4136b506779afbfee0df1a9843ea059c5e6` (Bitwarden 저장 권장)
- AWS IAM 추가 정책: GH_DEPLOY_APPS 의 `pulumi-import-iam-read`
- 현재 stack 상태: 18 resources, S3 backend `s3://lk-cicd-pulumi/.pulumi/stacks/expo-s1-infra/e1s.json`
