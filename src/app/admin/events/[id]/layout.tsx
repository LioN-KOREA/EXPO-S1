import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/admin/Breadcrumb';

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 'new' 같은 동적 경로는 layout 적용 X — 그대로 children
  if (id === 'new') return <>{children}</>;

  const supabase = await createClient();
  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', id)
    .single();

  if (!event) notFound();

  return (
    <>
      <Breadcrumb eventId={event.id} eventName={event.name} />
      {children}
    </>
  );
}
