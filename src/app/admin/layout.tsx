import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Toaster } from '@/components/ui/sonner';

export default async function AdminLayout({
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
    console.error('[admin/layout] auth.getUser failed', err);
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
    console.error('[admin/layout] profile fetch failed', err);
    profileFailed = true;
  }

  if (profileFailed || !profile || profile.role !== 'admin') redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar userName={profile.name} userEmail={profile.email} />
      <main className="flex-1 overflow-auto">
        <div className="pt-14 px-4 pb-6 lg:pt-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
