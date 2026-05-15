import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InterpreterHeader } from '@/components/interpreter/InterpreterHeader';
import { Toaster } from '@/components/ui/sonner';
import { I18nWrapper } from '@/components/I18nWrapper';
import { batchIn } from '@/lib/supabase/batch-query';

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

  // 전체 상담일지 통계 (모든 이벤트 합산)
  const { data: myConsultations } = await supabase
    .from('consultations')
    .select('id')
    .eq('interpreter_id', user.id);
  const consultationIds = myConsultations?.map((c) => c.id) ?? [];
  const totalCount = consultationIds.length;

  let submittedCount = 0;
  if (consultationIds.length > 0) {
    const reports = await batchIn(
      (ids) => supabase.from('consultation_reports').select('report_status, submitted').in('consultation_id', ids),
      consultationIds,
    );
    submittedCount = reports.filter((r: Record<string, unknown>) => {
      const rs = r.report_status ?? (r.submitted ? 'submitted' : 'draft');
      return rs === 'approved' || rs === 'excellent';
    }).length;
  }

  // 미확인 공지 수 (count() 쿼리로 최적화 — MEDIUM#7 수정)
  let unreadNotices = 0;
  const { count: totalNoticeCount } = await supabase
    .from('notices')
    .select('id', { count: 'exact', head: true })
    .contains('target_roles', JSON.stringify(['interpreter']));

  if (totalNoticeCount && totalNoticeCount > 0) {
    const { count: readCount } = await supabase
      .from('notice_reads')
      .select('notice_id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    unreadNotices = Math.max(0, totalNoticeCount - (readCount ?? 0));
  }

  return (
    <I18nWrapper locale="ko">
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
