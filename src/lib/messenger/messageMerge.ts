// 순수 함수: 메시지 배열 병합·정렬. useMessageSync / appendLocal / realtime INSERT 가 공유.
// 정렬 키 = (created_at ASC, id ASC). 동일 created_at 시 id 로 안정 정렬.

import type { MessageRow } from './messageRepository';

function compareByTime(a: MessageRow, b: MessageRow): number {
  if (a.created_at === b.created_at) return a.id.localeCompare(b.id);
  return a.created_at.localeCompare(b.created_at);
}

/** 단일 메시지 upsert. 중복 id 면 patch 병합, 없으면 append + 정렬. */
export function upsertMessageSorted(list: MessageRow[], incoming: MessageRow): MessageRow[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...incoming };
    return next;
  }
  const inserted = [...list, incoming];
  inserted.sort(compareByTime);
  return inserted;
}

/** server 응답 + 로컬 (realtime 으로 먼저 도착한) 메시지 병합. id 기준 dedupe, server 우선. */
export function mergeMessagesById(serverItems: MessageRow[], local: MessageRow[]): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  for (const m of serverItems) byId.set(m.id, m);
  for (const m of local) if (!byId.has(m.id)) byId.set(m.id, m);
  const arr = Array.from(byId.values());
  arr.sort(compareByTime);
  return arr;
}

/** partial patch 적용. id 못 찾으면 list 그대로. */
export function patchMessageById(
  list: MessageRow[],
  patch: Partial<MessageRow> & { id: string }
): MessageRow[] {
  return list.map((m) => (m.id === patch.id ? { ...m, ...patch } : m));
}
