'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';

interface NoticeItem {
  id: string;
  message: string;
  sent_at: string;
  event_name: string;
}

interface Props {
  items: NoticeItem[];
  initialReadIds: string[];
  userId: string;
}

export function InterpreterNoticeList({ items, initialReadIds, userId }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [readSet, setReadSet] = useState<Set<string>>(new Set(initialReadIds));

  async function handleToggle(id: string) {
    const willOpen = expanded !== id;
    setExpanded(willOpen ? id : null);

    if (willOpen && !readSet.has(id)) {
      const supabase = createClient();
      const { error } = await supabase
        .from('notice_reads')
        .insert({ notice_id: id, user_id: userId });
      if (!error) {
        setReadSet((prev) => new Set(prev).add(id));
        router.refresh();
      }
    }
  }

  return (
    <div className="space-y-3">
      {items.map((n) => {
        const isRead = readSet.has(n.id);
        const isOpen = expanded === n.id;
        const preview = n.message.length > 80 ? n.message.slice(0, 80) + '...' : n.message;

        return (
          <Card
            key={n.id}
            className={`border-0 shadow-sm cursor-pointer transition-all hover:shadow-lg ${
              isRead ? '' : 'ring-2 ring-rose-200 dark:ring-rose-900/40'
            }`}
            onClick={() => handleToggle(n.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {!isRead && (
                    <span className="w-2 h-2 bg-rose-500 rounded-full shrink-0" aria-label={t.interpreter.unread} />
                  )}
                  <span className="text-xs font-semibold text-rose-500 truncate">
                    {n.event_name}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(n.sent_at).toLocaleString(locale === 'en' ? 'en-US' : 'ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                {isOpen ? n.message : preview}
              </p>
              <div className="mt-2 flex items-center text-xs text-slate-500">
                {isOpen ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 mr-0.5" />
                    {t.interpreter.collapse}
                  </>
                ) : (
                  n.message.length > 80 && (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 mr-0.5" />
                      {t.interpreter.expand}
                    </>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
