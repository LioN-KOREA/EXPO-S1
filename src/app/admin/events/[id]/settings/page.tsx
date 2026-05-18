'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface EventOptions {
  prior_match: boolean;
  greeting: boolean;
  onsite_match: boolean;
  ai_interpret: boolean;
  video_call: boolean;
  infodesk_target: 'buyer' | 'seller' | 'all';
}

const TOGGLE_DEFS: { key: keyof Omit<EventOptions, 'infodesk_target'>; label: string; desc: string }[] = [
  { key: 'prior_match', label: '사전 매칭', desc: '바이어·셀러 사전 매칭 기능 사용' },
  { key: 'greeting', label: '인사말', desc: '상담 시작 시 인사말 노출' },
  { key: 'onsite_match', label: '현장 매칭', desc: '현장에서 즉석 매칭 허용' },
  { key: 'ai_interpret', label: 'AI 통역', desc: 'AI 보조 통역 기능' },
  { key: 'video_call', label: '화상 상담', desc: '비대면 화상 상담 활성화' },
];

export default function EventSettingsPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [options, setOptions] = useState<EventOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/options`);
      if (!res.ok) throw new Error('옵션 조회 실패');
      const json = await res.json();
      setOptions(json.options);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!options) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      toast.success('옵션이 저장되었습니다');
      setOptions(json.options);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">옵션</h2>
          <p className="text-slate-500 text-sm mt-1">상담회 기능 활성화 옵션을 설정합니다</p>
        </div>
        <Button onClick={save} disabled={saving || !options} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-1" />
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>

      {loading || !options ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">불러오는 중...</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* 기능 토글 */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">기능 활성화</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TOGGLE_DEFS.map(({ key, label, desc }) => (
                <label key={key} className="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer">
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={options[key]}
                    onClick={() => setOptions({ ...options, [key]: !options[key] })}
                    className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${
                      options[key] ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        options[key] ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* 인포데스크 대상 */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">인포데스크 노출 대상</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">인포데스크 화면에서 검색 가능한 사용자 그룹을 선택합니다</p>
              {(['all', 'buyer', 'seller'] as const).map((v) => (
                <label key={v} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer">
                  <input
                    type="radio"
                    name="infodesk_target"
                    value={v}
                    checked={options.infodesk_target === v}
                    onChange={() => setOptions({ ...options, infodesk_target: v })}
                  />
                  <span className="text-sm">
                    {v === 'all' ? '바이어 + 셀러 모두' : v === 'buyer' ? '바이어만' : '셀러만'}
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
