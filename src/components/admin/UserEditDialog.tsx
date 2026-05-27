'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { COUNTRIES } from '@/lib/constants/countries';
import { getInitialPassword } from '@/lib/utils/password';
import type { Profile, UserRole } from '@/types';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '관리자',
  interpreter: '통역사',
  seller: '셀러',
  buyer: '바이어',
};

interface UserEditDialogProps {
  user: Profile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function UserEditDialog({ user, open, onOpenChange, onUpdated }: UserEditDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('interpreter');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setRole(user.role);
      setPhone(user.phone || '');
      setLanguage(user.language || '');
      setCompanyName(user.company_name || '');
      setCountry(user.country || '');
      setCountrySearch('');
    }
  }, [user]);

  const filteredCountries = countrySearch
    ? COUNTRIES.filter(c =>
        c.name_ko.includes(countrySearch) ||
        c.name_en.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase())
      ).slice(0, 20)
    : COUNTRIES.slice(0, 20);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const updates: Record<string, string> = {};
      if (name !== user.name) updates.name = name;
      if (email !== user.email) updates.email = email;
      if (role !== user.role) updates.role = role;
      if (phone !== (user.phone || '')) updates.phone = phone;
      if (language !== (user.language || '')) updates.language = language;
      if (companyName !== (user.company_name || '')) updates.company_name = companyName;
      if (country !== (user.country || '')) updates.country = country;

      if (Object.keys(updates).length === 0) {
        toast.info('변경된 내용이 없습니다');
        return;
      }

      if (updates.email) {
        const confirmed = confirm('이메일을 변경하면 로그인 ID가 변경됩니다. 해당 사용자는 다시 로그인해야 합니다.\n계속하시겠습니까?');
        if (!confirmed) return;
      }

      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '수정 실패'); return; }

      toast.success(`${name} 정보가 수정되었습니다`);
      onOpenChange(false);
      onUpdated();
    } catch { toast.error('오류가 발생했습니다'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>사용자 정보 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>이메일 *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>역할 *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue>{ROLE_LABEL[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">관리자</SelectItem>
                <SelectItem value="interpreter">통역사</SelectItem>
                <SelectItem value="seller">셀러</SelectItem>
                <SelectItem value="buyer">바이어</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>전화번호</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" />
          </div>
          {role === 'interpreter' && (
            <div className="space-y-2">
              <Label>통역 언어</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="예: 영어, 중국어" />
            </div>
          )}
          <div className="space-y-2">
            <Label>회사명</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>국가</Label>
            <div className="relative">
              <Input
                placeholder="국가 검색 (예: 한국, KR)"
                value={countrySearch || (country ? COUNTRIES.find(c => c.code === country)?.name_ko || country : '')}
                onChange={(e) => { setCountrySearch(e.target.value); setCountry(''); }}
                onFocus={() => setCountrySearch(countrySearch || '')}
              />
              {countrySearch !== '' && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                  {filteredCountries.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex justify-between items-center"
                      onClick={() => { setCountry(c.code); setCountrySearch(''); }}
                    >
                      <span>{c.name_ko}</span>
                      <span className="text-xs text-slate-400">{c.code}</span>
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <p className="px-3 py-2 text-sm text-slate-400">검색 결과 없음</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </form>

        {/* 비밀번호 리셋 */}
        <div className="border-t pt-4 mt-2">
          <p className="text-xs text-muted-foreground mb-2">비밀번호 관리</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={async () => {
                if (!user) return;
                const newPw = prompt('새 비밀번호를 입력하세요 (최소 6자):');
                if (!newPw || newPw.length < 6) { toast.error('비밀번호는 최소 6자 이상이어야 합니다'); return; }
                const forceChange = confirm('첫 로그인 시 비밀번호 변경을 강제하시겠습니까?');
                try {
                  const res = await fetch(`/api/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: newPw, must_change_password: forceChange }),
                  });
                  if (!res.ok) { const d = await res.json(); toast.error(d.error || '비밀번호 변경 실패'); return; }
                  toast.success('비밀번호가 변경되었습니다');
                } catch { toast.error('오류가 발생했습니다'); }
              }}
            >
              비밀번호 변경
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={async () => {
                if (!user) return;
                if (!user.phone) { toast.error('전화번호가 없어 초기화할 수 없습니다'); return; }
                const pwd = getInitialPassword(user.phone);
                if (pwd === 'excon00') { toast.error('전화번호 자릿수가 너무 짧아 초기화할 수 없습니다'); return; }
                if (!confirm(`비밀번호를 ${pwd}로 초기화하시겠습니까?\n(전화번호 뒷자리 — 국가번호·지역번호 제외)\n첫 로그인 시 변경이 강제됩니다.`)) return;
                try {
                  const res = await fetch(`/api/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd, must_change_password: true }),
                  });
                  if (!res.ok) { const d = await res.json(); toast.error(d.error || '초기화 실패'); return; }
                  toast.success(`비밀번호가 ${pwd}로 초기화되었습니다`);
                } catch { toast.error('오류가 발생했습니다'); }
              }}
            >
              전화번호로 초기화
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
