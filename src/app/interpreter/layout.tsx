import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterpreterHeader } from '@/components/interpreter/InterpreterHeader';
import { Toaster } from '@/components/ui/sonner';
import { I18nWrapper } from '@/components/I18nWrapper';
import { getServerLocale } from '@/lib/i18n/server';
import { getInterpreterStats } from '@/lib/cache/interpreter-stats';

export default async function InterpreterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'interpreter') redirect('/login');

  const { totalCount, submittedCount, unreadNotices } = await getInterpreterStats(user.id);

  const locale = await getServerLocale();

  return (
    <I18nWrapper locale={locale}>
      <div className="min-h-screen bg-background">
        <InterpreterHeader
          userName={profile.name}
          userEmail={profile.email}
          submittedCount={submittedCount}
          totalCount={totalCount}
          unreadNotices={unreadNotices}
        />
        <main className="max-w-4xl mx-auto px-4 py-6">
          {children}
        </main>
        <Toaster />
      </div>
    </I18nWrapper>
  );
}
