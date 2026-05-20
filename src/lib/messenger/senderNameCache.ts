// realtime payload 의 sender_name 누락 보강용 클라이언트 캐시.
// useMessageSync 의 profiles 직접 조회 (스키마 leak) 를 단일 모듈로 격리.
// 본 모듈만 profiles 테이블 알고, 호출자는 sender_id → name 만 본다.

import { createClient } from '@/lib/supabase/client';

const cache = new Map<string, string | null>();

export async function lookupSenderName(senderId: string): Promise<string | null> {
  if (cache.has(senderId)) return cache.get(senderId) ?? null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', senderId)
      .maybeSingle();
    const name = (data?.name as string | undefined) ?? null;
    cache.set(senderId, name);
    return name;
  } catch {
    return null;
  }
}

/** thread 전환 등 시점에 캐시 비우기 (선택). */
export function clearSenderNameCache(): void {
  cache.clear();
}
