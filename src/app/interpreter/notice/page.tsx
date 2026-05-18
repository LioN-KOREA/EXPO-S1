import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Megaphone, Clock } from 'lucide-react';
import { InterpreterNoticeList } from './InterpreterNoticeList';
import { getServerDictionary } from '@/lib/i18n/server';
import { tmpl } from '@/lib/i18n/dictionaries';

export default async function InterpreterNoticePage() {
  const t = await getServerDictionary();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 통역사 대상 공지 (RLS가 자기 역할만 보이게 필터, target_roles에 interpreter 포함)
  const { data: notices } = await supabase
    .from('notices')
    .select('id, message, sent_at, event_id, target_roles, events(name)')
    .contains('target_roles', JSON.stringify(['interpreter']))
    .order('sent_at', { ascending: false });

  const items = (notices ?? []).map((n) => {
    const ev = n.events as unknown as { name?: string } | { name?: string }[] | null;
    const event_name = Array.isArray(ev) ? (ev[0]?.name ?? '') : (ev?.name ?? '');
    return {
      id: n.id,
      message: n.message,
      sent_at: n.sent_at,
      event_name,
    };
  });

  // 본인이 읽은 공지 ID 목록
  const { data: reads } = await supabase
    .from('notice_reads')
    .select('notice_id')
    .eq('user_id', user.id);
  const readSet = new Set(reads?.map((r) => r.notice_id) ?? []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-rose-500" />
          {t.interpreter.noticesTitle}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {tmpl(t.interpreter.noticeStatsTotal, {
            total: items.length,
            unread: items.filter((i) => !readSet.has(i.id)).length,
          })}
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Megaphone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">{t.interpreter.noNotices}</p>
          </CardContent>
        </Card>
      ) : (
        <InterpreterNoticeList items={items} initialReadIds={Array.from(readSet)} userId={user.id} />
      )}
    </div>
  );
}
