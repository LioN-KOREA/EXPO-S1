import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterpreterHeader } from '@/components/interpreter/InterpreterHeader';
import { Toaster } from '@/components/ui/sonner';
import { I18nWrapper } from '@/components/I18nWrapper';
import { getServerLocale } from '@/lib/i18n/server';
import { getInterpreterStats, type InterpreterStats } from '@/lib/cache/interpreter-stats';

export default async function InterpreterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // redirect() 는 NEXT_REDIRECT 를 throw 하므로 try/catch 밖에서 호출.
  let userId: string | null = null;
  let authFailed = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (err) {
    console.error('[interpreter/layout] auth.getUser failed', err);
    authFailed = true;
  }

  if (authFailed || !userId) redirect('/login');

  let profile: { name: string; email: string; role: string } | null = null;
  let profileFailed = false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('name, email, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    profile = data;
  } catch (err) {
    console.error('[interpreter/layout] profile fetch failed', err);
    profileFailed = true;
  }

  if (profileFailed || !profile || profile.role !== 'interpreter') redirect('/login');

  // 헤더 카운터 stats: fail 시 0/0/0 fallback (페이지 자체는 살아남아야 함).
  let stats: InterpreterStats = { totalCount: 0, submittedCount: 0, unreadNotices: 0 };
  try {
    stats = await getInterpreterStats(userId);
  } catch (err) {
    console.error('[interpreter/layout] getInterpreterStats failed', err);
  }

  const locale = await getServerLocale();

  return (
    <I18nWrapper locale={locale}>
      <div className="min-h-screen bg-background">
        <InterpreterHeader
          userName={profile.name}
          userEmail={profile.email}
          submittedCount={stats.submittedCount}
          totalCount={stats.totalCount}
          unreadNotices={stats.unreadNotices}
        />
        <main className="max-w-4xl mx-auto px-4 py-6">
          {children}
        </main>
        <Toaster />
      </div>
    </I18nWrapper>
  );
}
