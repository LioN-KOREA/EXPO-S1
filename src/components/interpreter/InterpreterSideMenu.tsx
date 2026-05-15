'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Menu,
  QrCode,
  ScanLine,
  FileText,
  Megaphone,
  BookOpen,
  CalendarDays,
  LogOut,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

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
  const [open, setOpen] = useState(false);
  const router = useRouter();

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
        aria-label="메뉴 열기"
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
      >
        <Menu className="w-5 h-5" />
        {unreadNotices > 0 && (
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
                <p className="text-xs text-rose-500 font-semibold">통역사</p>
                <p className="text-base font-bold text-foreground truncate">{userName}</p>
                {userEmail && <p className="text-xs text-slate-500 truncate">{userEmail}</p>}
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* QR 영역 */}
          <div className="grid grid-cols-2 gap-3 p-4 border-b">
            <button
              onClick={() => { close(); toast.info('QR코드 스캔 준비중 (Phase E-2)'); }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card hover:bg-muted transition-colors"
            >
              <ScanLine className="w-6 h-6 text-rose-500" />
              <span className="text-xs font-medium">QR코드 스캔</span>
            </button>
            <button
              onClick={() => { close(); toast.info('내 QR코드 준비중 (Phase E-2)'); }}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card hover:bg-muted transition-colors"
            >
              <QrCode className="w-6 h-6 text-rose-500" />
              <span className="text-xs font-medium">내 QR코드</span>
            </button>
          </div>

          {/* 제출현황 */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-muted">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-medium">제출된 상담일지</span>
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
                <span className="text-sm font-medium">공지사항</span>
              </div>
              {unreadNotices > 0 && (
                <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                  {unreadNotices}
                </span>
              )}
            </Link>

            <Link
              href="/interpreter/glossary"
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <BookOpen className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium">무역 용어집</span>
            </Link>

            <Link
              href="/interpreter"
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
            >
              <CalendarDays className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium">다른 상담회 보기</span>
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
            로그아웃
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
