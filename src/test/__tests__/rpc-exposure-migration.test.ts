/**
 * 마이그 053 정적 검증 — 서버전용 RPC 의 anon/authenticated 노출 회귀 차단.
 *
 * 배경: `REVOKE ALL ON FUNCTION ... FROM PUBLIC` 만으로는 권한이 회수되지 않는다.
 * Supabase 는 public 스키마 함수에 default privileges 로 anon/authenticated 에게
 * **명시적** GRANT 를 부여하고, FROM PUBLIC 리보크는 ACL 의 PUBLIC 항목만 지운다.
 * (CREATE OR REPLACE 도 기존 ACL 을 유지하므로 재정의로는 회수되지 않는다.)
 * → 롤을 명시한 REVOKE 가 반드시 있어야 한다.
 *
 * 실제 ACL 검증은 마이그 053 말미의 DO 블록이 DB 에서 직접 수행한다.
 * 본 테스트는 그 REVOKE 문이 마이그에서 삭제되는 회귀만 막는다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/053_revoke_anon_rpc_execute.sql'),
  'utf-8',
);

// 본문에 auth.uid()/is_admin() 가드가 없고 service_role 로만 호출되는 함수들.
const SERVER_ONLY_RPCS = [
  'purge_old_messages',
  'dispatch_due_scheduled_notices',
  'ai_reserve_call',
  'interpreter_add_consultation',
  'interpreter_delete_added_consultation',
];

describe('마이그 053 — 서버전용 RPC 노출 차단', () => {
  for (const fn of SERVER_ONLY_RPCS) {
    it(`${fn} 는 anon/authenticated 에서 EXECUTE 회수`, () => {
      const re = new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*FROM PUBLIC, anon, authenticated`,
      );
      expect(sql).toMatch(re);
    });

    it(`${fn} 는 service_role 에 GRANT 유지`, () => {
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`),
      );
    });
  }

  it('회수 실패 시 마이그가 실패하도록 ACL 재확인 가드 포함', () => {
    expect(sql).toMatch(/has_function_privilege\('anon',\s*p\.oid,\s*'EXECUTE'\)/);
    expect(sql).toMatch(/has_function_privilege\('authenticated',\s*p\.oid,\s*'EXECUTE'\)/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });
});
