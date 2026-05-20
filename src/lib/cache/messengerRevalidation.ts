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

// 메신저 메시지 / read 갱신 후 캐시 무효화 hook.
// 현재 unread 는 realtime + per-fetch 로 충분 (server cache 미도입) → no-op 유지.
// 향후 server cache 도입 시 본 함수에서 revalidateTag 호출 추가.
// 호출자는 항상 이 함수를 통해 트리거 — 정책 단일 출처 보장.
export function revalidateForMessengerEvent(role: 'admin' | 'interpreter'): void {
  void role;
}
