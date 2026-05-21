'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useUnreadBadge } from '@/lib/messenger/useUnreadBadge';
import {
  Menu,
  FileText,
  Megaphone,
  MessageSquare,
  BookOpen,
  CalendarDays,
  LogOut,
  User,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface InterpreterSideMenuProps {
  userName: string;
  userEmail?: string;
  submittedCount?: number;
  totalCount?: number;
  unreadNotices?: number;
}

export function InterpreterSideMenu({
  userName,
  userEmail,
  submittedCount = 0,
  totalCount = 0,
  unreadNotices = 0,
}: InterpreterSideMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { total: unreadMessages } = useUnreadBadge();
  const baseTitleRef = useRef<string | null>(null);

  // 탭 제목 (N) 갱신 — mount 시 baseTitle 캡쳐
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title;
    }
    const base = baseTitleRef.current;
    document.title = unreadMessages > 0 ? `(${unreadMessages > 99 ? '99+' : unreadMessages}) ${base}` : base;
  }, [unreadMessages]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  function close() {
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t.common.menu}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
      >
        <Menu className="w-5 h-5" />
        {(unreadNotices > 0 || unreadMessages > 0) && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[360px] p-0 flex flex-col">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-rose-500 font-semibold">{t.roles.interpreter}</p>
                <p className="text-base font-bold text-foreground truncate">{userName}</p>
                {userEmail && <p className="text-xs text-slate-500 truncate">{userEmail}</p>}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* 제출현황 */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-muted">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-medium">{t.interpreter.submittedReports}</span>
              </div>
              <span className="text-sm font-bold text-rose-500">
                {submittedCount}/{totalCount}
              </span>
            </div>
          </div>

          {/* 메뉴 */}
          <nav className="p-2">
            <Link
              href="/interpreter/notice"
              onClick={close}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <Megaphone className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-medium">{t.interpreter.noticesTitle}</span>
              </div>
              {unreadNotices > 0 && (
                <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                  {unreadNotices}
                </span>
              )}
            </Link>

            <Link
              href="/interpreter/messages"
              onClick={close}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-medium">{t.interpreter.messengerTitle}</span>
              </div>
              {unreadMessages > 0 && (
                <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </Link>

            <Link
              href="/interpreter/glossary"
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <BookOpen className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium">{t.interpreter.glossaryTitle}</span>
            </Link>

            <Link
              href="/interpreter"
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <CalendarDays className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium">{t.interpreter.otherEvent}</span>
            </Link>
          </nav>
        </div>

        {/* 로그아웃 */}
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-slate-500 hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            {t.common.logout}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
