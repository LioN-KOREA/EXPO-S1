// 행사 옵션 페이지 — 정책 정리 전까지 비활성화 (2026-05-27 운영 결정).
// 직접 URL 접근 차단. 향후 정책 정리 후 본 파일을 원복하면 즉시 복원.
// 클라이언트 컴포넌트는 보관용 (.client.tsx 등으로 분리하면 더 깔끔하지만 git history 유지를 위해 동일 파일에 보존).

import { notFound } from 'next/navigation';

export default function EventSettingsPage() {
  notFound();
}
