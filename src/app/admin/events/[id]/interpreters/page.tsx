'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExcelUploader } from '@/components/admin/ExcelUploader';
import { ArrowLeft, Users, Search, Upload, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Profile } from '@/types';

export default function InterpretersPage() {
  const params = useParams();
  const eventId = params.id as string;
  const [interpreters, setInterpreters] = useState<Profile[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    const supabase = createClient();
    const [allRes, assignedRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'interpreter').order('name'),
      supabase.from('event_interpreters').select('interpreter_id').eq('event_id', eventId),
    ]);
    setInterpreters(allRes.data || []);
    setAssigned(assignedRes.data?.map((ei) => ei.interpreter_id) || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search) return interpreters;
    const q = search.toLowerCase();
    return interpreters.filter(i => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
  }, [interpreters, search]);

  // 배정된 통역사를 상단에
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aAssigned = assigned.includes(a.id) ? 0 : 1;
      const bAssigned = assigned.includes(b.id) ? 0 : 1;
      return aAssigned - bAssigned;
    });
  }, [filtered, assigned]);

  async function toggleAssignment(interpreterId: string) {
    const supabase = createClient();
    const isAssigned = assigned.includes(interpreterId);

    if (isAssigned) {
      await supabase.from('event_interpreters').delete().eq('event_id', eventId).eq('interpreter_id', interpreterId);
      setAssigned(assigned.filter(id => id !== interpreterId));
    } else {
      await supabase.from('event_interpreters').insert({ event_id: eventId, interpreter_id: interpreterId });
      setAssigned([...assigned, interpreterId]);
    }
  }

  // 전체 선택/해제
  async function selectAll() {
    const supabase = createClient();
    const unassigned = filtered.filter(i => !assigned.includes(i.id));
    for (const i of unassigned) {
      await supabase.from('event_interpreters').insert({ event_id: eventId, interpreter_id: i.id });
    }
    setAssigned([...assigned, ...unassigned.map(i => i.id)]);
    toast.success(`${unassigned.length}명 배정`);
  }

  async function deselectAll() {
    const supabase = createClient();
    const assignedInView = filtered.filter(i => assigned.includes(i.id));
    for (const i of assignedInView) {
      await supabase.from('event_interpreters').delete().eq('event_id', eventId).eq('interpreter_id', i.id);
    }
    setAssigned(assigned.filter(id => !assignedInView.map(i => i.id).includes(id)));
    toast.success(`${assignedInView.length}명 해제`);
  }

  const [uploadMode, setUploadMode] = useState<'replace' | 'append'>('replace');

  // 엑셀 업로드로 통역사 계정 생성 + 이벤트 배정
  async function handleExcelUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', eventId);
    formData.append('mode', uploadMode);

    try {
      const res = await fetch('/api/upload/interpreters-excel', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '업로드 실패'); return; }
      toast.success(`${data.created}명 신규 생성, ${data.assigned}명 배정`);
      setShowUpload(false);
      load();
    } catch { toast.error('업로드 오류'); }
    finally { setUploading(false); }
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/events/${eventId}`} className="inline-flex items-center text-sm text-slate-500 hover:text-muted-foreground mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        상담회 상세로
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">통역사 관리</h2>
          <p className="text-slate-500 text-sm mt-1">이 상담회에 참여할 통역사를 관리합니다</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)}>
          <Upload className="w-4 h-4 mr-1" />
          {showUpload ? '닫기' : '엑셀 업로드'}
        </Button>
      </div>

      {/* 엑셀 업로드 */}
      {showUpload && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader><CardTitle className="text-lg">통역사 엑셀 업로드</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">
              엑셀 파일 (이름, 이메일, 전화번호)로 통역사 계정을 생성하고 이 상담회에 배정합니다.
              PW는 전화번호 뒤 4자리. 이미 있는 계정은 새로 만들지 않고 배정만 합니다.
            </p>

            {/* 교체 vs 추가 선택 */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setUploadMode('replace')}
                className={`flex-1 p-3 rounded-lg border text-left text-sm transition-all ${
                  uploadMode === 'replace'
                    ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                    : 'border-border hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-foreground">교체</p>
                <p className="text-xs text-slate-500 mt-0.5">기존 배정 해제 → 엑셀 통역사만 배정</p>
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('append')}
                className={`flex-1 p-3 rounded-lg border text-left text-sm transition-all ${
                  uploadMode === 'append'
                    ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-300'
                    : 'border-border hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-foreground">추가</p>
                <p className="text-xs text-slate-500 mt-0.5">기존 배정 유지 + 엑셀 통역사 추가</p>
              </button>
            </div>

            <ExcelUploader onUpload={handleExcelUpload} loading={uploading} description="통역사 명단 엑셀 업로드" />
          </CardContent>
        </Card>
      )}

      {/* 검색 + 통계 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="이름 또는 이메일로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Badge variant="secondary" className="whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          {assigned.length}명 배정
        </Badge>
      </div>

      {/* 전체 선택/해제 */}
      <div className="flex gap-2 mb-3">
        <Button variant="outline" size="sm" onClick={selectAll} className="text-xs h-7">
          전체 선택
        </Button>
        <Button variant="outline" size="sm" onClick={deselectAll} className="text-xs h-7">
          전체 해제
        </Button>
      </div>

      {/* 통역사 목록 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-slate-500 p-6">로딩 중...</p>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-center">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-slate-500">등록된 통역사가 없습니다</p>
              <p className="text-xs text-slate-500 mt-1">사용자 관리에서 통역사 계정을 생성하거나 엑셀을 업로드하세요</p>
            </div>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {sorted.map((interpreter) => {
                const isAssigned = assigned.includes(interpreter.id);
                return (
                  <button
                    key={interpreter.id}
                    type="button"
                    onClick={() => toggleAssignment(interpreter.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-all text-left hover:bg-muted ${
                      isAssigned ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isAssigned ? 'bg-blue-100 text-blue-700' : 'bg-card text-slate-500'
                      }`}>
                        {interpreter.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{interpreter.name}</p>
                        <p className="text-xs text-slate-500">{interpreter.email}</p>
                      </div>
                    </div>
                    <Badge variant={isAssigned ? 'default' : 'secondary'} className="text-xs">
                      {isAssigned ? '배정됨' : '미배정'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
