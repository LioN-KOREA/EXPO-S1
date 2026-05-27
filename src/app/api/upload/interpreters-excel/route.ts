import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { readSheetRows } from '@/lib/excel/reader';
import { getInitialPassword } from '@/lib/utils/password';
import { ensureAdmin } from '@/lib/auth/guards';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const eventId = formData.get('event_id') as string;

  const mode = (formData.get('mode') as string) || 'replace';

  if (!file || !eventId) return NextResponse.json({ error: '파일과 이벤트 ID가 필요합니다' }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // 파싱을 먼저 수행 (교체 전에 검증)
    const buffer = await file.arrayBuffer();
    const data = await readSheetRows(buffer);

    if (data.length < 2) throw new Error('최소 2행(헤더+데이터) 필요');

    // 헤더에서 이름/이메일/전화 열 찾기
    const headers = (data[0] ?? []).map(h => String(h || '').toLowerCase());
    const nameCol = headers.findIndex(h => h.includes('이름') || h.includes('name'));
    const emailCol = headers.findIndex(h => h.includes('이메일') || h.includes('email') || h.includes('메일'));
    const phoneCol = headers.findIndex(h => h.includes('전화') || h.includes('phone') || h.includes('연락'));
    const langCol = headers.findIndex(h => h.includes('언어') || h.includes('lang') || h.includes('통역'));

    if (nameCol === -1 || emailCol === -1) throw new Error('이름과 이메일 열이 필요합니다');

    // 교체 모드: 검증 완료 후 기존 배정 해제
    if (mode === 'replace') {
      await admin.from('event_interpreters').delete().eq('event_id', eventId);
    }

    let created = 0;
    let assigned = 0;

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const name = String(row[nameCol] || '').trim();
      const email = String(row[emailCol] || '').trim();
      const phone = phoneCol >= 0 ? String(row[phoneCol] || '').trim() : '';
      const language = langCol >= 0 ? String(row[langCol] || '').trim() : '';

      if (!name || !email) continue;

      // 기존 계정 확인
      const { data: existing } = await admin.from('profiles').select('id').eq('email', email).single();

      let userId: string;

      if (existing) {
        userId = existing.id;
        // 언어 정보 업데이트 (있으면)
        if (language) await admin.from('profiles').update({ language }).eq('id', userId);
      } else {
        // 계정 생성 (PW = 전화번호 숫자 전체)
        const password = getInitialPassword(phone);
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
        });
        if (authErr) { console.warn(`계정 생성 실패 (${email}):`, authErr.message); continue; }

        const { error: profileErr } = await admin.from('profiles').insert({
          id: authData.user.id, email, name, role: 'interpreter', phone, language: language || null,
          must_change_password: false,
        });
        if (profileErr) {
          await admin.auth.admin.deleteUser(authData.user.id);
          console.warn(`프로필 생성 실패 (${email}):`, profileErr.message);
          continue;
        }
        userId = authData.user.id;
        created++;
      }

      // 이벤트 배정
      const { data: alreadyAssigned } = await admin
        .from('event_interpreters')
        .select('id')
        .eq('event_id', eventId)
        .eq('interpreter_id', userId)
        .single();

      if (!alreadyAssigned) {
        await admin.from('event_interpreters').insert({ event_id: eventId, interpreter_id: userId });
        assigned++;
      }
    }

    return NextResponse.json({ success: true, created, assigned });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파싱 오류';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
