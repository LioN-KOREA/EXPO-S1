import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterpreterHeader } from '@/components/interpreter/InterpreterHeader';
import { Toaster } from '@/components/ui/sonner';
import { I18nWrapper } from '@/components/I18nWrapper';

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile || profile.role !== 'buyer') redirect('/login');

  return (
    <I18nWrapper locale="en">
      <div className="min-h-screen bg-background">
        <InterpreterHeader userName={profile.name} />
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
        <Toaster />
      </div>
    </I18nWrapper>
  );
}
