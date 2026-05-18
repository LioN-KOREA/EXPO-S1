'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/context';
import type { TemplateField } from '@/types';

interface Props {
  consultationId: string;
  eventId: string;
  missingFields: TemplateField[];
}

interface AlertRow {
  id: string;
  status: 'pending' | 'resolved';
  missing_keys: string[];
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function MissingAutoFieldsAlert({ consultationId, eventId, missingFields }: Props) {
  const { t } = useI18n();
  const [alertRow, setAlertRow] = useState<AlertRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('consultation_data_alerts')
        .select('id, status, missing_keys, note, created_at, resolved_at')
        .eq('consultation_id', consultationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setAlertRow(data as AlertRow | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [consultationId]);

  if (loading) return null;
  if (missingFields.length === 0) return null;

  const pendingAlert = alertRow?.status === 'pending' ? alertRow : null;

  async function sendAlert() {
    setSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error(t.interpreter.loginRequired);
      setSubmitting(false);
      return;
    }
    const { data, error } = await supabase
      .from('consultation_data_alerts')
      .insert({
        consultation_id: consultationId,
        event_id: eventId,
        requester_id: user.id,
        missing_keys: missingFields.map((f) => f.key),
        note: note.trim() || null,
      })
      .select('id, status, missing_keys, note, created_at, resolved_at')
      .single();
    if (error) {
      // pending unique 충돌 시 친화적 메시지 + 최신 pending row를 재조회해 UI를 실제 상태로 동기화
      if (error.code === '23505') {
        toast.error(t.interpreter.dataAlertAlreadyExists);
        const { data: latest } = await supabase
          .from('consultation_data_alerts')
          .select('id, status, missing_keys, note, created_at, resolved_at')
          .eq('consultation_id', consultationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest) {
          setAlertRow(latest as AlertRow);
          setExpanded(false);
          setNote('');
        }
      } else {
        toast.error(t.interpreter.dataAlertFailed + (error.message ? `: ${error.message}` : ''));
      }
    } else if (data) {
      setAlertRow(data as AlertRow);
      toast.success(t.interpreter.dataAlertSent);
      setExpanded(false);
      setNote('');
    }
    setSubmitting(false);
  }

  if (pendingAlert) {
    return (
      <Card className="border-0 shadow-sm mb-4 bg-amber-50/50 border-amber-100">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700">{t.interpreter.dataAlertPendingTitle}</p>
              <p className="text-xs text-amber-600 mt-1">
                {missingFields.map((f) => f.label).join(', ')}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {new Date(pendingAlert.created_at).toLocaleString('ko-KR')} {t.interpreter.dataAlertSentAt}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // resolved 알림이 있고, 아직도 missingFields가 비어있는 경우 → 재요청 가능 UI 노출.
  // missingFields.length > 0 가드는 컴포넌트 상단에서 이미 처리됨.
  if (alertRow?.status === 'resolved') {
    return (
      <Card className="border-0 shadow-sm mb-4 bg-emerald-50/50 border-emerald-100">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-700">{t.interpreter.dataAlertResolvedTitle}</p>
              <p className="text-xs text-slate-500 mt-1">
                {t.interpreter.dataAlertResolvedDesc}
              </p>
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs text-amber-700">
                  {t.interpreter.dataAlertResolvedButStillMissing}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  {missingFields.map((f) => f.label).join(', ')}
                </p>
                {!expanded ? (
                  <Button
                    size="sm"
                    onClick={() => setExpanded(true)}
                    className="gap-1.5 mt-3 bg-amber-500 hover:bg-amber-600"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {t.interpreter.dataAlertAskAgain}
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t.interpreter.dataAlertNotePlaceholder}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={sendAlert}
                        disabled={submitting}
                        className="gap-1.5 bg-amber-500 hover:bg-amber-600"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {submitting ? t.interpreter.dataAlertSending : t.interpreter.dataAlertSend}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setExpanded(false); setNote(''); }}
                        disabled={submitting}
                      >
                        {t.common.cancel}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm mb-4 bg-red-50/50 border-red-100">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">{t.interpreter.dataAlertMissingTitle}</p>
            <p className="text-xs text-red-600 mt-1">
              {missingFields.map((f) => f.label).join(', ')}
            </p>
            <p className="text-xs text-slate-500 mt-2">{t.interpreter.dataAlertMissingDesc}</p>

            {!expanded ? (
              <Button
                size="sm"
                onClick={() => setExpanded(true)}
                className="gap-1.5 mt-3 bg-red-500 hover:bg-red-600"
              >
                <Send className="w-3.5 h-3.5" />
                {t.interpreter.dataAlertAskAdmin}
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.interpreter.dataAlertNotePlaceholder}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={sendAlert}
                    disabled={submitting}
                    className="gap-1.5 bg-red-500 hover:bg-red-600"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? t.interpreter.dataAlertSending : t.interpreter.dataAlertSend}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setExpanded(false); setNote(''); }}
                    disabled={submitting}
                  >
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
