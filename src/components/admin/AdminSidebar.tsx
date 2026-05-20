'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  LogOut,
  Menu,
  X,
  ClipboardCheck,
  Activity,
  SlidersHorizontal,
  Info,
  Megaphone,
  MessageSquare,
  ClipboardList,
  CalendarClock,
  Languages,
  FileText,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUnreadBadge } from '@/lib/messenger/useUnreadBadge';

const navItems = [
  { href: '/admin', label: '대시보드', icon: LayoutDashboard },
  { href: '/admin/events', label: '상담회 관리', icon: CalendarDays },
  { href: '/admin/users', label: '사용자 관리', icon: Users },
];

// 이벤트 상세 진입 시 노출되는 메뉴 — 카테고리 그룹
type EventGroup = {
  title: string;
  items: { suffix: string; label: string; icon: typeof LayoutDashboard }[];
};

const eventGroups: EventGroup[] = [
  {
    title: '분석',
    items: [
      { suffix: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    ],
  },
  {
    title: '준비',
    items: [
      { suffix: '/registration', label: '데이터 업로드', icon: ClipboardList },
      { suffix: '/timetable', label: '타임테이블', icon: CalendarClock },
      { suffix: '/interpreters', label: '통역사 배정', icon: Languages },
      { suffix: '/template', label: '상담일지 양식', icon: FileText },
      { suffix: '/settings', label: '옵션', icon: SlidersHorizontal },
    ],
  },
  {
    title: '운영',
    items: [
      { suffix: '/attendance', label: '출석표', icon: ClipboardCheck },
      { suffix: '/operate', label: '현장운영', icon: Activity },
      { suffix: '/infodesk', label: '인포데스크', icon: Info },
      { suffix: '/notice', label: '공지사항', icon: Megaphone },
      { suffix: '/messages', label: '메시지', icon: MessageSquare },
    ],
  },
  {
    title: '기록',
    items: [
      { suffix: '/reports', label: '상담일지', icon: BookOpen },
    ],
  },
];

// /admin/events/[id]/... 형태 경로에서 [id] 추출
function extractEventId(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/events\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;
  const id = match[1];
  // 'new' 같은 동적 경로 제외
  if (id === 'new') return null;
  return id;
}

interface AdminSidebarProps {
  userName: string;
  userEmail: string;
}

export function AdminSidebar({ userName, userEmail }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const eventId = extractEventId(pathname);
  const { total: unreadMessages, byThread: unreadByThread } = useUnreadBadge(eventId ?? undefined);
  void unreadByThread;
  const baseTitleRef = useRef<string | null>(null);

  // 탭 제목 (N) 갱신 — admin 전역. baseTitle 을 mount 시 1회 캡쳐해 regex 충돌 회피.
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

  const sidebarContent = (
    <>
      {/* 로고 */}
      <Link href="/admin" className="block p-6 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors" onClick={() => setMobileOpen(false)}>
        <Logo size={32} textSize="16px" />
      </Link>

      {/* 네비게이션 */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-slate-400 hover:bg-card hover:text-foreground/80'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}

        {/* 이벤트 상세 진입 시 카테고리별 메뉴 */}
        {eventId && (
          <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-3">
            <p className="px-4 text-[10px] uppercase tracking-wider text-slate-500">현재 상담회</p>
            {eventGroups.map((group) => (
              <div key={group.title} className="space-y-0.5">
                <p className="px-4 mb-1 text-[10px] font-semibold tracking-wider text-slate-600">
                  {group.title}
                </p>
                {group.items.map((sub) => {
                  const href = `/admin/events/${eventId}${sub.suffix}`;
                  const isActive = pathname === href || pathname.startsWith(href + '/');
                  const showMsgBadge = sub.suffix === '/messages' && unreadMessages > 0;
                  return (
                    <Link
                      key={sub.suffix}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center justify-between gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                        isActive
                          ? 'bg-white/[0.08] text-white'
                          : 'text-slate-400 hover:bg-card hover:text-foreground/80'
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <sub.icon className="w-4 h-4" />
                        {sub.label}
                      </span>
                      {showMsgBadge && (
                        <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                          {unreadMessages > 9 ? '9+' : unreadMessages}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* 사용자 정보 + 로그아웃 */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="px-4 py-3 mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">{userName}</p>
            <p className="text-xs text-slate-500 truncate">{userEmail}</p>
          </div>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-400 hover:text-foreground/80 hover:bg-card"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* 모바일 햄버거 */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'linear-gradient(180deg, #0c0f18 0%, #0a0d14 100%)' }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
