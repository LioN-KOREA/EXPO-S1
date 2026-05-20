// 도메인별 캐시 무효화 규칙 단일 출처.
// 각 라우트가 revalidateTag 직접 호출하지 않고 이 모듈 경유 — 정책 변경 시 1군데만 수정.

import { revalidateTag } from 'next/cache';
import { INTERPRETER_STATS_TAG } from './interpreter-stats';

/** notice 발송/수정/삭제 후 호출. interpreter 대상이면 stats 캐시 무효화. */
export function revalidateForNoticeRoles(roles: ReadonlyArray<string>): void {
  if (roles.includes('interpreter')) {
    revalidateTag(INTERPRETER_STATS_TAG, 'max');
  }
}

/** 메신저 메시지 / read 갱신 후. 현재 server cache 미사용 — no-op. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function revalidateForMessengerEvent(_role: 'admin' | 'interpreter'): void {
  // 향후 unread server cache 도입 시 활성. 현재 realtime + per-fetch 로 충분.
}
