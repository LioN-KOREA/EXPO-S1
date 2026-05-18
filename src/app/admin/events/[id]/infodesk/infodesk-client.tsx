'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, MapPin, Phone, Mail, User2 } from 'lucide-react';

export interface InfodeskEntry {
  kind: 'buyer' | 'seller';
  id: string;
  company: string;
  contact: string;
  country: string;
  booth: string;
  email: string;
  phone: string;
}

export function InfodeskClient({ entries }: { entries: InfodeskEntry[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'buyer' | 'seller'>('ALL');
  const [selected, setSelected] = useState<InfodeskEntry | null>(null);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== 'ALL') list = list.filter(e => e.kind === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        e.company.toLowerCase().includes(q)
        || e.contact.toLowerCase().includes(q)
        || e.phone.toLowerCase().includes(q)
        || e.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, filter, search]);

  return (
    <>
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="회사명·담당자·연락처 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'ALL' | 'buyer' | 'seller')}
            className="h-9 px-2 text-sm border rounded-md bg-background"
          >
            <option value="ALL">전체</option>
            <option value="buyer">바이어</option>
            <option value="seller">셀러</option>
          </select>
          <span className="text-sm text-slate-500 ml-auto">총 {filtered.length}건</span>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 && (
          <Card className="border-0 shadow-sm md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-slate-500">
              검색 결과가 없습니다.
            </CardContent>
          </Card>
        )}
        {filtered.map((e) => (
          <button
            key={`${e.kind}-${e.id}`}
            type="button"
            onClick={() => setSelected(e)}
            className="text-left"
          >
            <Card className="border-0 shadow-sm hover:shadow-md transition-all h-full cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge variant={e.kind === 'buyer' ? 'default' : 'secondary'}>
                    {e.kind === 'buyer' ? '바이어' : '셀러'}
                  </Badge>
                  {e.booth && (
                    <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {e.booth}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm mb-1 line-clamp-1">{e.company}</div>
                {e.contact && (
                  <div className="text-xs text-slate-600 inline-flex items-center gap-1 mb-1">
                    <User2 className="w-3 h-3" /> {e.contact}
                  </div>
                )}
                {e.country && (
                  <div className="text-xs text-slate-500">{e.country}</div>
                )}
                <div className="mt-2 space-y-0.5">
                  {e.phone && (
                    <div className="text-xs text-slate-600 inline-flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {e.phone}
                    </div>
                  )}
                  {e.email && (
                    <div className="text-xs text-slate-500 inline-flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{e.email}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant={selected?.kind === 'buyer' ? 'default' : 'secondary'}>
                {selected?.kind === 'buyer' ? '바이어' : '셀러'}
              </Badge>
              {selected?.company}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <Row label="담당자" value={selected.contact} />
              <Row label="국가" value={selected.country} />
              <Row label="부스번호" value={selected.booth} />
              <Row label="연락처" value={selected.phone} />
              <Row label="이메일" value={selected.email} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-500 w-16 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground flex-1">{value || '—'}</span>
    </div>
  );
}
