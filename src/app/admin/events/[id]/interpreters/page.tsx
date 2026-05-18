'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Users, Search, CheckCircle2 } from 'lucide-react';
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


  return (
    <div className="max-w-2xl">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">통역사 관리</h2>
          <p className="text-slate-500 text-sm mt-1">이 상담회에 참여할 통역사를 관리합니다</p>
        </div>
        <Link href={`/admin/events/${eventId}/registration`} className="block sm:inline-block sm:self-auto">
          <Button variant="outline" size="sm" className="w-full sm:w-auto">등록 탭에서 추가</Button>
        </Link>
      </div>

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
