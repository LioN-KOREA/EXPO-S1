'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { TemplateDownloadButton } from '@/components/admin/TemplateDownloadButton';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface PreviewData {
  time_slots: { date: string; start_time: string; end_time: string; slot_order: number }[];
  buyers: { company_name: string; buyer_name: string; country: string; email: string; phone: string; booth_number: string }[];
  sellers: { company_name: string; company_name_kr: string; contact_name: string; email: string }[];
  consultations: { buyer_index: number; slot_index: number }[];
}

interface PreviewError {
  row: number;
  field: string;
  message: string;
}

export function TimetableRegistration({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewErrors, setPreviewErrors] = useState<PreviewError[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{ slots: number; buyers: number; sellers: number; consultations: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [existingReports, setExistingReports] = useState<{ total: number; submitted: number; inProgress: number }>({ total: 0, submitted: 0, inProgress: 0 });

  async function handleUpload(file: File) {
    setLoading(true);
    setPreview(null);
    setPreviewErrors([]);
    setPreviewFile(file);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('event_id', eventId);
    try {
      const res = await fetch('/api/preview/timetable', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '파싱 실패'); setPreviewFile(null); return; }
      setPreview(data.preview);
      setPreviewErrors(data.errors || []);
      setPreviewSummary(data.summary);
      setExistingReports(data.existingReports || { total: 0, submitted: 0, inProgress: 0 });
    } catch { toast.error('파싱 중 오류'); setPreviewFile(null); }
    finally { setLoading(false); }
  }

  async function handleConfirmUpload() {
    if (!previewFile) return;
    if (existingReports.total > 0) {
      const confirmed = confirm(
        `주의: 기존 상담일지 ${existingReports.total}건이 삭제됩니다.\n` +
        (existingReports.submitted > 0 ? `(제출완료 ${existingReports.submitted}건 포함)\n` : '') +
        `\n정말 재업로드하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
      );
      if (!confirmed) return;
    }
    setConfirming(true);
    const fd = new FormData();
    fd.append('file', previewFile);
    fd.append('event_id', eventId);
    try {
      const res = await fetch('/api/upload/timetable', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }
      toast.success(`업로드 완료: ${data.summary.buyers}명 바이어, ${data.summary.consultations}건 매칭`);
      setPreview(null);
      setPreviewFile(null);
      setPreviewErrors([]);
      setPreviewSummary(null);
    } catch { toast.error('업로드 중 오류'); }
    finally { setConfirming(false); }
  }

  function cancelPreview() {
    setPreview(null);
    setPreviewFile(null);
    setPreviewErrors([]);
    setPreviewSummary(null);
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-lg">상담 스케줄 엑셀 업로드</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">엑셀 업로드 시 바이어/셀러 계정이 자동 생성됩니다. 기존 데이터가 있으면 덮어쓰기됩니다.</p>
            <TemplateDownloadButton type="timetable" />
          </div>
          <ExcelUploader onUpload={handleUpload} loading={loading} description="상담테이블 엑셀 파일 업로드" />
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">업로드 미리보기</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelPreview}>취소</Button>
                <Button size="sm" onClick={handleConfirmUpload} disabled={confirming} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                  {confirming ? '저장 중...' : '확인 후 저장'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{previewSummary?.slots ?? 0}</p>
                <p className="text-xs text-blue-600">타임슬롯</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-emerald-700">{previewSummary?.buyers ?? 0}</p>
                <p className="text-xs text-emerald-600">바이어</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-purple-700">{previewSummary?.sellers ?? 0}</p>
                <p className="text-xs text-purple-600">셀러</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{previewSummary?.consultations ?? 0}</p>
                <p className="text-xs text-amber-600">상담 매칭</p>
              </div>
            </div>

            {existingReports.total > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">주의: 기존 상담일지가 삭제됩니다</span>
                </div>
                <p className="text-xs text-red-600 ml-6">
                  현재 상담일지 {existingReports.total}건
                  {existingReports.submitted > 0 && ` (제출완료 ${existingReports.submitted}건)`}
                  {existingReports.inProgress > 0 && ` (작성중 ${existingReports.inProgress}건)`}
                  이 삭제됩니다.
                </p>
              </div>
            )}

            {previewErrors.length > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">{previewErrors.length}건의 문제</span>
                </div>
                <ul className="space-y-1">
                  {previewErrors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600">행 {err.row + 1}: {err.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-700">검증 완료 - 문제가 없습니다</span>
                </div>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">바이어 목록</h4>
              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">#</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">회사명</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">담당자</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">국가</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">이메일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.buyers.map((b, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                        <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-foreground">{b.company_name || '(비어있음)'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{b.buyer_name}</td>
                        <td className="px-3 py-1.5 text-slate-500">{b.country || '(비어있음)'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{b.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">타임슬롯</h4>
              <div className="flex flex-wrap gap-2">
                {preview.time_slots.map((slot, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{slot.date} {slot.start_time}~{slot.end_time}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
