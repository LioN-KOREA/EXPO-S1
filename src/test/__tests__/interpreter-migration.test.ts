/**
 * 마이그 044 정적 검증 — PRD #16 / 슬라이스 S0.
 *
 * SQL 텍스트 invariant 회귀 차단 (통합 테스트가 docker off 시 skip 되므로).
 *
 * 설계: profiles 컬럼 추가 대신 별도 테이블 `interpreter_global_meta` 분리.
 * (Postgres column-level REVOKE 가 table-level GRANT 와 충돌하여 무효이므로
 *  row-level RLS 로 admin-only 차단을 보장하기 위함.)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/044_interpreter_management.sql'),
  'utf-8',
);

describe('마이그 044 정적 검증', () => {
  it('interpreter_global_meta 테이블 idempotent', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS interpreter_global_meta/);
  });

  it('interpreter_global_meta PK = profiles(id) FK', () => {
    expect(sql).toMatch(/interpreter_id uuid PRIMARY KEY REFERENCES profiles\(id\) ON DELETE CASCADE/);
  });

  it('interpreter_global_meta grade CHECK 한글 4 값', () => {
    expect(sql).toMatch(/interpreter_global_meta_grade_check[\s\S]+?'특급'[\s\S]+?'우수'[\s\S]+?'보통'[\s\S]+?'주의'/);
  });

  it('interpreter_global_meta rehire_status CHECK 한글 3 값', () => {
    expect(sql).toMatch(/interpreter_global_meta_rehire_status_check[\s\S]+?'가능'[\s\S]+?'불가'[\s\S]+?'보류'/);
  });

  it('interpreter_global_meta base_rate ≥ 0 CHECK', () => {
    expect(sql).toMatch(/interpreter_global_meta_base_rate_nonneg[\s\S]+?base_rate >= 0/);
  });

  it('interpreter_global_meta RLS ENABLE', () => {
    expect(sql).toMatch(/ALTER TABLE interpreter_global_meta ENABLE ROW LEVEL SECURITY/);
  });

  it('interpreter_global_meta 4 정책 admin-only', () => {
    for (const op of ['select', 'insert', 'update', 'delete']) {
      const re = new RegExp(
        `CREATE POLICY interpreter_global_meta_admin_${op} ON interpreter_global_meta[\\s\\S]+?p\\.role = 'admin'`,
      );
      expect(sql).toMatch(re);
    }
  });

  it('interpreter_global_meta updated_at 자동 갱신 트리거', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.interpreter_global_meta_touch_updated_at[\s\S]+?SET search_path = public, pg_temp/);
    expect(sql).toMatch(/CREATE TRIGGER interpreter_global_meta_touch[\s\S]+?BEFORE UPDATE ON interpreter_global_meta/);
  });

  it('interpreter_evaluations 테이블 idempotent', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS interpreter_evaluations/);
  });

  it('interpreter_evaluations UNIQUE(interpreter_id, event_id)', () => {
    expect(sql).toMatch(/interpreter_evaluations_unique_pair[\s\S]+?UNIQUE \(interpreter_id, event_id\)/);
  });

  it('interpreter_evaluations paid_rate ≥ 0 CHECK', () => {
    expect(sql).toMatch(/interpreter_evaluations_paid_rate_nonneg[\s\S]+?paid_rate >= 0/);
  });

  it('interpreter_evaluations RLS ENABLE + 4 정책 admin-only', () => {
    expect(sql).toMatch(/ALTER TABLE interpreter_evaluations ENABLE ROW LEVEL SECURITY/);
    for (const op of ['select', 'insert', 'update', 'delete']) {
      const re = new RegExp(
        `CREATE POLICY interpreter_evaluations_admin_${op} ON interpreter_evaluations[\\s\\S]+?p\\.role = 'admin'`,
      );
      expect(sql).toMatch(re);
    }
  });

  it('interpreter_evaluations 인덱스 (interpreter_id) + (event_id)', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS interpreter_evaluations_interpreter_idx[\s\S]+?\(interpreter_id\)/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS interpreter_evaluations_event_idx[\s\S]+?\(event_id\)/);
  });

  it('update_interpreter_global_fields RPC = SECURITY DEFINER + search_path', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_interpreter_global_fields[\s\S]+?SECURITY DEFINER[\s\S]+?SET search_path = public, pg_temp/,
    );
  });

  it('RPC 호출자 admin 검증 (RAISE EXCEPTION + ERRCODE 42501)', () => {
    expect(sql).toMatch(/caller_role IS DISTINCT FROM 'admin'[\s\S]+?forbidden_not_admin[\s\S]+?ERRCODE = '42501'/);
  });

  it('RPC 대상 interpreter 검증', () => {
    expect(sql).toMatch(/target_role IS NULL[\s\S]+?target_not_found/);
    expect(sql).toMatch(/target_role IS DISTINCT FROM 'interpreter'[\s\S]+?target_not_interpreter/);
  });

  it('RPC enum 검증 + base_rate ≥ 0', () => {
    expect(sql).toMatch(/p_grade NOT IN \('특급','우수','보통','주의'\)[\s\S]+?invalid_grade/);
    expect(sql).toMatch(/p_rehire_status NOT IN \('가능','불가','보류'\)[\s\S]+?invalid_rehire_status/);
    expect(sql).toMatch(/p_base_rate < 0[\s\S]+?invalid_base_rate/);
  });

  it('RPC upsert into interpreter_global_meta (ON CONFLICT)', () => {
    expect(sql).toMatch(/INSERT INTO interpreter_global_meta[\s\S]+?ON CONFLICT \(interpreter_id\) DO UPDATE/);
  });

  it('RPC REVOKE PUBLIC + GRANT authenticated', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.update_interpreter_global_fields\(uuid, text, numeric, text, text\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_interpreter_global_fields\(uuid, text, numeric, text, text\) TO authenticated/,
    );
  });

  it('profiles 변경 없음 (column 추가/REVOKE 없음)', () => {
    expect(sql).not.toMatch(/ALTER TABLE profiles/);
    expect(sql).not.toMatch(/REVOKE.*ON profiles/);
  });
});
