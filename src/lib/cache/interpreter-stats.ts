import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { batchIn } from '@/lib/supabase/batch-query';

export const INTERPRETER_STATS_TAG = 'interpreter-stats';

export type InterpreterStats = {
  totalCount: number;
  submittedCount: number;
  unreadNotices: number;
};

export function getInterpreterStats(userId: string): Promise<InterpreterStats> {
  return unstable_cache(
    async (): Promise<InterpreterStats> => {
      const supabase = createAdminClient();

      const { data: myConsultations } = await supabase
        .from('consultations')
        .select('id')
        .eq('interpreter_id', userId);
      const consultationIds = myConsultations?.map((c) => c.id) ?? [];
      const totalCount = consultationIds.length;

      let submittedCount = 0;
      if (consultationIds.length > 0) {
        const reports = await batchIn(
          (ids) =>
            supabase
              .from('consultation_reports')
              .select('report_status, submitted')
              .in('consultation_id', ids),
          consultationIds,
        );
        submittedCount = reports.filter((r: Record<string, unknown>) => {
          const rs = r.report_status ?? (r.submitted ? 'submitted' : 'draft');
          return rs === 'approved' || rs === 'excellent';
        }).length;
      }

      let unreadNotices = 0;
      const { count: totalNoticeCount } = await supabase
        .from('notices')
        .select('id', { count: 'exact', head: true })
        .contains('target_roles', JSON.stringify(['interpreter']));

      if (totalNoticeCount && totalNoticeCount > 0) {
        const { count: readCount } = await supabase
          .from('notice_reads')
          .select('notice_id', { count: 'exact', head: true })
          .eq('user_id', userId);
        unreadNotices = Math.max(0, totalNoticeCount - (readCount ?? 0));
      }

      return { totalCount, submittedCount, unreadNotices };
    },
    ['interpreter-stats', userId],
    { tags: [INTERPRETER_STATS_TAG], revalidate: 60 },
  )();
}
