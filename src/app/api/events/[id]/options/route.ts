// 행사 옵션 API — 정책 정리 전까지 비활성화 (2026-05-27 운영 결정).
// 사이드바·상세 화면의 "옵션" 메뉴 제거와 일관성. URL/API 직접 호출 우회 차단.
// 향후 정책 정리 후 GET/PATCH 본문을 복원하면 즉시 사용 가능.

import { NextRequest, NextResponse } from 'next/server';

function disabled() {
  return NextResponse.json({ error: '옵션 기능 비활성화' }, { status: 404 });
}

export async function GET(_request: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  return disabled();
}

export async function PATCH(_request: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  return disabled();
}
