import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterpreterHeader } from '@/components/interpreter/InterpreterHeader';
import { Toaster } from '@/components/ui/sonner';
import { I18nWrapper } from '@/components/I18nWrapper';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  let userId: string | null = null;
  let authFailed = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (err) {
    console.error('[seller/layout] auth.getUser failed', err);
    authFailed = true;
  }

  if (authFailed || !userId) redirect('/login');

  let profile: { name: string; role: string } | null = null;
  let profileFailed = false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    profile = data;
  } catch (err) {
    console.error('[seller/layout] profile fetch failed', err);
    profileFailed = true;
  }

  if (profileFailed || !profile || profile.role !== 'seller') redirect('/login');

  return (
    <I18nWrapper locale="ko">
      <div className="min-h-screen bg-background">
        <InterpreterHeader userName={profile.name} />
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
        <Toaster />
      </div>
    </I18nWrapper>
  );
}
