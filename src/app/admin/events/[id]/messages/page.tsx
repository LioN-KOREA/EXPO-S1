import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminMessengerClient } from './AdminMessengerClient';

export default async function AdminMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">메시지</h2>
        <p className="text-slate-500 text-sm mt-1">
          이벤트 내 통역사와 1:1 양방향 채팅
        </p>
      </div>
      <AdminMessengerClient eventId={eventId} currentUserId={user.id} />
    </div>
  );
}
