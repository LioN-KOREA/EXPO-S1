-- ============================================
-- 통역사 본인 QR 출석 INSERT 허용 (Phase E)
-- ============================================
-- 배경: attendances INSERT 는 admin only 였음 (019_attendance.sql).
-- 통역사가 본인 폰으로 QR 스캔 → 본인 attendance 행 생성하려 했지만 RLS 차단.
--
-- 보안 제약 (Codex 검수 반영):
-- - user_id = auth.uid() — 본인 행만
-- - account_type = 'INTERPRETER' — SELLER 위장 차단
-- - status = 'WAITING' — DONE/LEAVE 등 운영 상태 위조 차단 (운영 전이는 admin 만)
-- - work_type = 'REGULAR' — RESERVE 위장 차단
-- - eval IS NULL / memo IS NULL / booth_id IS NULL — 평가·메모·부스 위조 차단
-- - date = CURRENT_DATE — 과거/미래 출석 위조 차단
-- - profile role = 'interpreter' — 다른 역할의 우회 차단
-- - event_interpreters 매핑 존재 — 본인이 배정된 행사만
-- - events 활성 + 오늘이 행사 기간 내 — 종료된/예정 행사 출석 위조 차단
--
-- 같은 날 중복 출석은 UNIQUE(event_id, user_id, date) + 클라이언트의 ignoreDuplicates 로 처리.
--
-- 후속 강화 (이번 마이그 X — Phase F 추후):
-- - QR 증명 (signed nonce / one-time token) — 현재는 event_id 만 알면 QR 없이도 가능
-- - created_at 서버시간 강제 trigger — 현재 클라이언트가 임의 timestamp 주입 가능 (DEFAULT now() 우회)
-- ============================================

CREATE POLICY "attendances_insert_self_qr" ON attendances
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND account_type = 'INTERPRETER'
    AND status = 'WAITING'
    AND work_type = 'REGULAR'
    AND eval IS NULL
    AND memo IS NULL
    AND booth_id IS NULL
    AND date = CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'interpreter'
    )
    AND EXISTS (
      SELECT 1 FROM event_interpreters ei
      WHERE ei.event_id = attendances.event_id
        AND ei.interpreter_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = attendances.event_id
        AND e.deleted_at IS NULL
        AND e.start_date <= CURRENT_DATE
        AND e.end_date >= CURRENT_DATE
    )
  );
