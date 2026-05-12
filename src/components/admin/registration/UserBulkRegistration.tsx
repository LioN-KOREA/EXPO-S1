'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { TemplateDownloadButton } from '@/components/admin/TemplateDownloadButton';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCountryName } from '@/lib/constants/countries';
import type { UserRole } from '@/types';

interface PreviewUser {
  row_number: number;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  company_name?: string;
  country?: string;
  language?: string;
}

interface PreviewError {
  row: number;
  field: string;
  message: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  interpreter: '통역사',
  seller: '셀러',
  buyer: '바이어',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  interpreter: 'bg-blue-100 text-blue-700',
  seller: 'bg-emerald-100 text-emerald-700',
  buyer: 'bg-amber-100 text-amber-700',
};

export function UserBulkRegistration() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewUser[] | null>(null);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ total: number; admins: number; interpreters: number; buyers: number; sellers: number } | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);

  function resetState() {
    setPreview(null);
    setErrors([]);
    setDuplicates([]);
    setSummary(null);
    setPreviewFile(null);
  }

  async function handleUpload(file: File) {
    setLoading(true);
    resetState();
    setPreviewFile(file);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/preview/users', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '파싱 실패'); setPreviewFile(null); return; }
      setPreview(data.preview);
      setErrors(data.errors || []);
      setDuplicates(data.duplicates || []);
      setSummary(data.summary);
    } catch { toast.error('파싱 중 오류가 발생했습니다'); setPreviewFile(null); }
    finally { setLoading(false); }
  }

  async function handleConfirmUpload() {
    if (!previewFile) return;

    const registrable = (summary?.total || 0) - duplicates.length;
    if (registrable === 0) {
      toast.error('등록 가능한 사용자가 없습니다');
      return;
    }

    setConfirming(true);
    const fd = new FormData();
    fd.append('file', previewFile);

    try {
      const res = await fetch('/api/upload/users-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }

      let msg = `${data.created}명 계정 생성 완료`;
      if (data.skipped > 0) msg += ` (${data.skipped}명 중복 건너뜀)`;
      if (data.errors?.length > 0) msg += ` (${data.errors.length}건 오류)`;
      toast.success(msg);
      resetState();
    } catch { toast.error('업로드 중 오류가 발생했습니다'); }
    finally { setConfirming(false); }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">바이어 / 셀러 / 통역사 통합 등록</CardTitle>
            <TemplateDownloadButton type="users" label="양식 다운로드" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 mb-4">
            엑셀 파일 하나로 바이어, 셀러, 통역사 계정을 한번에 등록합니다.
            유형(바이어/셀러/통역사), 이름, 이메일, 연락처는 필수입니다.
            초기 비밀번호는 전화번호 뒤 4자리이며, 첫 로그인 시 변경해야 합니다.
          </p>
          {!preview && (
            <ExcelUploader onUpload={handleUpload} loading={loading} description="사용자 통합 등록 엑셀 파일을 업로드하세요" />
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">업로드 미리보기</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetState}>취소</Button>
                <Button
                  size="sm"
                  onClick={handleConfirmUpload}
                  disabled={confirming || (summary?.total || 0) - duplicates.length === 0}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600"
                >
                  {confirming ? '등록 중...' : `${(summary?.total || 0) - duplicates.length}명 등록`}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-slate-700">{summary?.total ?? 0}</p>
                <p className="text-xs text-slate-500">전체</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{summary?.buyers ?? 0}</p>
                <p className="text-xs text-amber-600">바이어</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-emerald-700">{summary?.sellers ?? 0}</p>
                <p className="text-xs text-emerald-600">셀러</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{summary?.interpreters ?? 0}</p>
                <p className="text-xs text-blue-600">통역사</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">{summary?.admins ?? 0}</p>
                <p className="text-xs text-red-600">관리자</p>
              </div>
            </div>

            {/* 중복 경고 */}
            {duplicates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-700">이미 등록된 이메일 {duplicates.length}건 (건너뜀)</span>
                </div>
                <p className="text-xs text-amber-600 ml-6">{duplicates.join(', ')}</p>
              </div>
            )}

            {/* 에러 */}
            {errors.filter(e => !e.message.includes('이미 등록된')).length > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">
                    {errors.filter(e => !e.message.includes('이미 등록된')).length}건의 문제
                  </span>
                </div>
                <ul className="space-y-1">
                  {errors.filter(e => !e.message.includes('이미 등록된')).map((err, i) => (
                    <li key={i} className="text-xs text-red-600">행 {err.row}: {err.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-emerald-700">검증 완료 - 문제가 없습니다</span>
                </div>
              </div>
            )}

            {/* 사용자 테이블 */}
            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">행</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">유형</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">이름</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">이메일</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">회사명</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">국가</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">연락처</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((u, i) => {
                    const isDuplicate = duplicates.includes(u.email);
                    return (
                      <tr key={i} className={isDuplicate ? 'bg-amber-50/50 opacity-60' : i % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                        <td className="px-3 py-2 text-slate-400">{u.row_number}</td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] border-0 ${ROLE_COLORS[u.role] || ''}`}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{u.name}</td>
                        <td className="px-3 py-2 text-slate-500">{u.email}</td>
                        <td className="px-3 py-2 text-slate-500">{u.company_name || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{u.country ? getCountryName(u.country) : '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{u.phone || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
