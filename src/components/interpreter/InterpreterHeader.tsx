'use client';

import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { InterpreterSideMenu } from '@/components/interpreter/InterpreterSideMenu';

interface InterpreterHeaderProps {
  userName: string;
  userEmail?: string;
  submittedCount?: number;
  totalCount?: number;
  unreadNotices?: number;
}

export function InterpreterHeader({
  userName,
  userEmail,
  submittedCount = 0,
  totalCount = 0,
  unreadNotices = 0,
}: InterpreterHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const roleHome = '/' + (pathname.split('/')[1] || 'login');

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className="bg-[#0a0d14] sticky top-0 z-30" style={{ borderBottom: '1px solid #000' }}>
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={roleHome} className="hover:opacity-80 transition-opacity">
          <Logo size={30} textSize="15px" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <span className="text-xs sm:text-sm text-slate-400 hidden sm:block max-w-[100px] truncate">{userName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] hidden sm:inline-flex"
            aria-label="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </Button>
          <InterpreterSideMenu
            userName={userName}
            userEmail={userEmail}
            submittedCount={submittedCount}
            totalCount={totalCount}
            unreadNotices={unreadNotices}
          />
        </div>
      </div>
    </header>
  );
}
