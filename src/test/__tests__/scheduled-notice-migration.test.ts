/**
 * 마이그 040 정적 검증 — SQL 텍스트의 핵심 invariant 회귀 차단.
 *
 * 통합 테스트(*.integration.test.ts) 가 로컬 supabase 가 켜져 있을 때만 돌므로,
 * CI 단위 트랙에서도 마이그 040 의 보안 핵심(SECURITY DEFINER + search_path,
 * REVOKE/GRANT, 영문 키워드, race 가드)이 빠지지 않았는지 텍스트 grep 으로 검증한다.
 *
 * 본 테스트는 "외부 행동" 단언이 아닌 "마이그 메타데이터" 단언이라는 점에서 예외적이다.
 * SQL 텍스트가 본 프로젝트에서는 사실상 외부 계약(=DB 의 사용자 노출 표면)이다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/040_scheduled_notices.sql'),
  'utf-8',
);

describe('마이그 040 정적 검증', () => {
  const adminRpcs = [
    'create_scheduled_notice',
    'update_scheduled_notice',
    'cancel_scheduled_notice',
    'list_scheduled_notices',
  ];
  const dispatchRpc = 'dispatch_due_scheduled_notices';

  for (const fn of [...adminRpcs, dispatchRpc]) {
    it(`${fn} 는 SECURITY DEFINER + search_path 고정`, () => {
      // CREATE OR REPLACE FUNCTION ... <fn>(...) ... SECURITY DEFINER ... SET search_path = public, pg_temp
      const re = new RegExp(
        `CREATE OR REPLACE FUNCTION[\\s\\S]+?${fn}[\\s\\S]+?SECURITY DEFINER[\\s\\S]+?SET search_path = public, pg_temp`,
      );
      expect(sql).toMatch(re);
    });
  }

  for (const fn of adminRpcs) {
    it(`${fn} 는 REVOKE PUBLIC + GRANT authenticated`, () => {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC`));
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`),
      );
    });
  }

  // ⚠️ 주의: 아래 단언은 "GRANT 라인이 없다" 만 보장할 뿐 실제 권한이 없음을 뜻하지 않는다.
  // Supabase 는 default privileges 로 anon/authenticated 에 명시적 GRANT 를 자동 부여하므로
  // FROM PUBLIC 리보크만으로는 회수되지 않는다. 실제 회수는 마이그 053 이 담당한다.
  // (rpc-exposure-migration.test.ts 참고)
  it('dispatch_due_scheduled_notices 는 service_role 에만 GRANT (authenticated 노출 X)', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.dispatch_due_scheduled_notices\(\) TO service_role/,
    );
    // authenticated 노출 라인은 없어야 함
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.dispatch_due_scheduled_notices\(\) TO authenticated/,
    );
  });

  it('영문 키워드 RAISE EXCEPTION + ERRCODE=42501 일관', () => {
    const keywords = [
      'unauthenticated',
      'not_admin',
      'past_schedule',
      'event_inactive',
      'event_ended',
      'recipient_not_interpreter',
      'recipient_empty',
      'not_scheduled',
      'message_empty',
      'message_too_long',
    ];
    for (const kw of keywords) {
      expect(sql).toMatch(
        new RegExp(`RAISE EXCEPTION '${kw}' USING ERRCODE = '42501'`),
      );
    }
  });

  it('dispatch_due_scheduled_notices 는 FOR UPDATE SKIP LOCKED 사용', () => {
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('update_scheduled_notice 는 status=scheduled 가드 + ROW_COUNT 검사', () => {
    // SELECT FOR UPDATE 단계
    expect(sql).toMatch(
      /SELECT event_id INTO v_event_id[\s\S]+?WHERE id = p_id[\s\S]+?AND status = 'scheduled'[\s\S]+?FOR UPDATE/,
    );
    // UPDATE 단계
    expect(sql).toMatch(
      /UPDATE public\.scheduled_notices[\s\S]+?WHERE id = p_id[\s\S]+?AND status = 'scheduled'/,
    );
    expect(sql).toMatch(/GET DIAGNOSTICS v_affected = ROW_COUNT/);
  });

  it('cancel_scheduled_notice 는 status=scheduled 가드 + ROW_COUNT 검사', () => {
    // cancel 함수 본문 안에 UPDATE + GET DIAGNOSTICS + IF v_affected = 0 분기 보장
    // (Codex SUGGEST#1 반영 — ROW_COUNT 검사 자체를 정적으로 단언)
    expect(sql).toMatch(
      /FUNCTION public\.cancel_scheduled_notice[\s\S]+?UPDATE public\.scheduled_notices[\s\S]+?SET status = 'cancelled'[\s\S]+?WHERE id = p_id[\s\S]+?AND status = 'scheduled'[\s\S]+?GET DIAGNOSTICS v_affected = ROW_COUNT[\s\S]+?IF v_affected = 0 THEN[\s\S]+?RAISE EXCEPTION 'not_scheduled'/,
    );
  });

  it('scheduled_notices 테이블 RLS 활성 + admin only', () => {
    expect(sql).toMatch(/ALTER TABLE scheduled_notices ENABLE ROW LEVEL SECURITY/);
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toMatch(
        new RegExp(
          `scheduled_notices_${cmd.toLowerCase()}_admin[\\s\\S]+?FOR ${cmd}[\\s\\S]+?role = 'admin'`,
        ),
      );
    }
  });

  it('notices.recipient_user_ids ALTER + 정책 갱신 포함', () => {
    expect(sql).toMatch(/ALTER TABLE notices[\s\S]+?ADD COLUMN IF NOT EXISTS recipient_user_ids UUID\[\]/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "notices_select_targeted" ON notices/);
    expect(sql).toMatch(
      /CREATE POLICY "notices_select_targeted"[\s\S]+?recipient_user_ids IS NULL[\s\S]+?auth\.uid\(\) = ANY\(notices\.recipient_user_ids\)/,
    );
  });

  it('scheduled_notices CHECK 제약: message 길이 + recipient 빈배열/NULL 차단 + status enum', () => {
    expect(sql).toMatch(/CHECK \(length\(message\) BETWEEN 1 AND 4000\)/);
    // cardinality 패턴 — Codex BLOCK#1 반영 (array_length 빈배열 NULL 통과 차단)
    expect(sql).toMatch(/CHECK \(cardinality\(recipient_user_ids\) >= 1\)/);
    expect(sql).toMatch(
      /CHECK \(array_position\(recipient_user_ids, NULL\) IS NULL\)/,
    );
    expect(sql).toMatch(
      /CHECK \(status IN \('scheduled', 'sent', 'cancelled', 'failed'\)\)/,
    );
  });

  it('notice_reads_insert_own 정책이 recipient_user_ids 가시성 게이트로 갱신됨', () => {
    // Codex WARN#1 반영 — 비수신자가 임의로 read marker 못 만들도록
    expect(sql).toMatch(/DROP POLICY IF EXISTS "notice_reads_insert_own" ON notice_reads/);
    expect(sql).toMatch(
      /CREATE POLICY "notice_reads_insert_own" ON notice_reads FOR INSERT[\s\S]+?recipient_user_ids IS NULL OR auth\.uid\(\) = ANY\(n\.recipient_user_ids\)/,
    );
  });

  it('pg_cron CREATE EXTENSION 도 try/except 로 감쌈 (BLOCK#2)', () => {
    // CREATE EXTENSION 자체가 DO 블록 안에 있어야 권한 실패 시 마이그 통과
    expect(sql).toMatch(
      /DO \$ext\$[\s\S]+?CREATE EXTENSION IF NOT EXISTS pg_cron[\s\S]+?EXCEPTION WHEN insufficient_privilege/,
    );
  });

  it('인덱스: dispatch 용 (status, scheduled_at) + 행사별 (event_id, created_at DESC)', () => {
    expect(sql).toMatch(/idx_scheduled_notices_dispatch[\s\S]+?\(status, scheduled_at\)/);
    expect(sql).toMatch(/idx_scheduled_notices_event[\s\S]+?\(event_id, created_at DESC\)/);
  });

  it('pg_cron 등록은 try/except 패턴 (권한 실패 시 RAISE NOTICE)', () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_cron/);
    expect(sql).toMatch(
      /EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_function/,
    );
    expect(sql).toMatch(/cron\.schedule\(\s*'dispatch_due_scheduled_notices_minutely',\s*'\* \* \* \* \*'/);
  });
});
