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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') redirect('/login');

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
