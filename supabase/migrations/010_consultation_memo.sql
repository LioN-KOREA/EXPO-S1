-- 상담 메모/비고 컬럼 추가
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS memo TEXT;
