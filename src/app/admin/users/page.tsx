'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Users, Shield, Languages, Building2, User, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { UserBulkUploadDialog } from '@/components/admin/UserBulkUploadDialog';
import { UserEditDialog } from '@/components/admin/UserEditDialog';
import { getCountryName } from '@/lib/constants/countries';
import type { Profile, UserRole } from '@/types';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: '관리자', color: 'bg-red-100 text-red-700', icon: Shield },
  interpreter: { label: '통역사', color: 'bg-blue-100 text-blue-700', icon: Languages },
  seller: { label: '셀러', color: 'bg-emerald-100 text-emerald-700', icon: Building2 },
  buyer: { label: '바이어', color: 'bg-amber-100 text-amber-700', icon: User },
};

const TABS = [
  { key: 'all', label: '전체' },
  { key: 'admin', label: '관리자' },
  { key: 'interpreter', label: '통역사' },
  { key: 'seller', label: '셀러' },
  { key: 'buyer', label: '바이어' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('interpreter');
  const [newPhone, setNewPhone] = useState('');
  const [newLanguage, setNewLanguage] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }

  const filteredUsers = useMemo(() => {
    let list = users;
    if (activeTab !== 'all') list = list.filter((u) => u.role === activeTab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [users, activeTab, search]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length };
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/upload/interpreters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: [{ name: newName, email: newEmail, password: newPassword, role: newRole, phone: newPhone, language: newLanguage || undefined }],
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '생성 실패'); return; }
      toast.success(`${newName} 계정이 생성되었습니다`);
      setDialogOpen(false);
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewPhone(''); setNewLanguage('');
      loadUsers();
    } catch { toast.error('오류가 발생했습니다'); }
    finally { setCreating(false); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map(u => u.id)));
    }
  }

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`"${userName}" 계정을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '삭제 실패'); return; }
      toast.success(`${userName} 삭제됨`);
      loadUsers();
      setSelected(prev => { const n = new Set(prev); n.delete(userId); return n; });
    } catch { toast.error('삭제 오류'); }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}명을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    let success = 0;
    for (const id of selected) {
      try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        if (res.ok) success++;
      } catch { /* skip */ }
    }
    toast.success(`${success}명 삭제 완료`);
    setSelected(new Set());
    setDeleting(false);
    loadUsers();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">사용자 관리</h2>
          <p className="text-slate-500 mt-1 text-sm">전체 사용자 계정을 관리합니다</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
          <UserBulkUploadDialog onComplete={loadUsers} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={<Button className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md" />}
          >
            <Plus className="w-4 h-4 mr-2" />
            계정 생성
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 사용자 생성</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label>이름 *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="홍길동" required />
              </div>
              <div className="space-y-2">
                <Label>이메일 *</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>비밀번호 *</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="최소 6자" minLength={6} required />
              </div>
              <div className="space-y-2">
                <Label>역할 *</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="010-1234-5678" />
              </div>
              {newRole === 'interpreter' && (
                <div className="space-y-2">
                  <Label>통역 언어 *</Label>
                  <Input value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} placeholder="예: 영어, 아랍어, 베트남어" required />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? '생성 중...' : '계정 생성'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* 역할별 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card
              key={key}
              className={`border-0 shadow-sm cursor-pointer transition-all ${activeTab === key ? 'ring-2 ring-blue-400' : 'hover:shadow-lg'}`}
              onClick={() => setActiveTab(activeTab === key ? 'all' : key)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{roleCounts[key] || 0}</p>
                  <p className="text-xs text-slate-500">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 탭 + 검색 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="flex gap-1 bg-card rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-slate-500 hover:text-muted-foreground'
              }`}
            >
              {tab.label} ({roleCounts[tab.key] || 0})
            </button>
          ))}
        </div>
        <Input
          placeholder="이름 또는 이메일 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-[200px] h-8 text-sm"
        />
      </div>

      {/* 선택 삭제 바 */}
      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 gap-2">
          <span className="text-sm text-red-700 font-medium">{selected.size}명 선택됨</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())} className="text-xs h-10 sm:h-7 flex-1 sm:flex-none">선택 해제</Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={deleting} className="text-xs h-10 sm:h-7 flex-1 sm:flex-none">
              <Trash2 className="w-3 h-3 mr-1" />
              {deleting ? '삭제 중...' : '선택 삭제'}
            </Button>
          </div>
        </div>
      )}

      {/* 사용자 목록 */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-slate-500 p-6">로딩 중...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">해당하는 사용자가 없습니다</p>
          ) : (
            <div className="divide-y">
              {/* 전체 선택 헤더 */}
              <div className="flex items-center gap-3 px-4 py-2 bg-muted border-b">
                <input
                  type="checkbox"
                  checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-xs text-slate-500">전체 선택</span>
              </div>
              {filteredUsers.map((user) => {
                const cfg = ROLE_CONFIG[user.role] || { label: user.role, color: 'bg-card text-muted-foreground', icon: User };
                const isSelected = selected.has(user.id);
                return (
                  <div key={user.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-2 hover:bg-muted ${isSelected ? 'bg-red-50/30' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(user.id)}
                        className="w-4 h-4 rounded border-slate-300 shrink-0"
                      />
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${cfg.color}`}>
                        {user.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap pl-11 sm:pl-0">
                      {user.company_name && <span className="text-xs text-slate-500 hidden lg:block truncate max-w-[120px]">{user.company_name}</span>}
                      {user.country && <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0">{getCountryName(user.country)}</Badge>}
                      {user.language && <Badge className="text-[10px] bg-sky-100 text-sky-700 border-0">{user.language}</Badge>}
                      {user.phone && <span className="text-xs text-slate-500 hidden lg:block">{user.phone}</span>}
                      <Badge className={`text-xs ${cfg.color} border-0`}>
                        {cfg.label}
                      </Badge>
                      <button
                        onClick={() => { setEditUser(user); setEditOpen(true); }}
                        className="p-2.5 sm:p-1.5 rounded-md text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-colors"
                        title="수정"
                        aria-label="사용자 수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id, user.name)}
                        className="p-2.5 sm:p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="삭제"
                        aria-label="사용자 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UserEditDialog
        user={editUser}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={loadUsers}
      />
    </div>
  );
}
