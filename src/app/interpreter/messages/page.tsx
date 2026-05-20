import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';
import { getServerDictionary } from '@/lib/i18n/server';
import { InterpreterMessengerClient } from './InterpreterMessengerClient';
import { getThreadForInterpreter, getOrCreateThread } from '@/lib/messenger/threadRepository';

export default async function InterpreterMessagesPage() {
  const t = await getServerDictionary();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 통역사 가장 최근 매핑된 event 의 thread 사용 (단순화 — 다중 이벤트는 추후 슬라이스)
  const { data: mapping } = await supabase
    .from('event_interpreters')
    .select('event_id, events(id, name, end_date)')
    .eq('interpreter_id', user.id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const eventRel = (mapping as { events?: { id: string; name: string; end_date: string | null } | { id: string; name: string; end_date: string | null }[] | null } | null)?.events;
  const event = Array.isArray(eventRel) ? eventRel[0] : eventRel;

  if (!event) {
    return (
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-rose-500" />
          {t.interpreter.messengerTitle}
        </h2>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-slate-500">{t.interpreter.messengerNoThreads}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // thread lazy upsert
  let thread = await getThreadForInterpreter(supabase, event.id, user.id);
  if (!thread) {
    thread = await getOrCreateThread(supabase, event.id, user.id);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      <header className="mb-3">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-rose-500" />
          {t.interpreter.messengerToAdmin}
        </h2>
        <p className="text-xs text-slate-500 mt-1">{event.name}</p>
      </header>
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
        <InterpreterMessengerClient threadId={thread.id} currentUserId={user.id} />
      </div>
    </div>
  );
}
