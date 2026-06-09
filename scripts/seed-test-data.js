const { createClient } = require('@supabase/supabase-js');
const admin = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU');

(async () => {
  // 기본 계정
  const accounts = [
    { email: 'admin@test.com', password: 'admin123', name: '관리자', role: 'admin' },
    { email: 'hys@test.com', password: '1234test', name: '홍영수', role: 'admin' },
    { email: 'hya@test.com', password: '1234test', name: '홍영아', role: 'interpreter', language: '영어' },
    { email: 'hyb@test.com', password: '1234test', name: '홍영비', role: 'seller' },
    { email: 'hyc@test.com', password: '1234test', name: '홍영씨', role: 'buyer' },
  ];
  for (const acc of accounts) {
    const { data } = await admin.auth.admin.createUser({ email: acc.email, password: acc.password, email_confirm: true });
    if (data?.user) await admin.from('profiles').insert({ id: data.user.id, email: acc.email, name: acc.name, role: acc.role, language: acc.language || null });
  }
  console.log('Accounts OK');

  // 상담회
  const { data: event } = await admin.from('events').insert({ name: '2026 contEXT 수출상담회', description: '서울 코엑스 수출 상담회', start_date: '2026-06-15', end_date: '2026-06-17', status: 'active' }).select('id').single();
  const eventId = event.id;

  // 통역사 10명
  const iNames = ['김민지','이서연','박지우','최수진','정하늘','강유나','윤서영','임다은','한소희','오지현'];
  const iIds = [];
  for (let i = 0; i < iNames.length; i++) {
    const e = 'interp' + (i + 1) + '@test.com';
    const { data } = await admin.auth.admin.createUser({ email: e, password: '1234test', email_confirm: true });
    if (!data?.user) continue;
    await admin.from('profiles').insert({ id: data.user.id, email: e, name: iNames[i], role: 'interpreter', language: ['영어','중국어','일본어','스페인어','프랑스어'][i % 5] });
    await admin.from('event_interpreters').insert({ event_id: eventId, interpreter_id: data.user.id });
    iIds.push(data.user.id);
  }
  console.log('Interpreters:', iIds.length);

  // 바이어 30명
  const countries = ['미국','중국','일본','독일','프랑스','영국','호주','캐나다','인도','브라질','베트남','태국','인도네시아','멕시코','스페인'];
  const buyerNames = ['글로벌파마','메디텍코리아','바이오솔루션','헬스케어그룹','뉴웰니스','테라퓨틱스','케미팜','드래곤바이오','골든헬스','이노메드','파시픽팜','선라이즈헬스','에버그린바이오','알파메딕','베타사이언스','감마텍','델타파마','엡실론헬스','제타바이오','에타메드','시타팜','이오타사이언스','카파헬스','람다바이오','뮤메딕','뉴팜','크사이헬스','오미크론바이오','파이메드','로텍'];
  const buyerPersons = ['김철수','이영희','박민수','최지영','정대현','강수진','윤태호','임미연','한상우','오정민','서지훈','장미경','조영철','배수현','송태민','신혜진','권도윤','류지선','남기환','문서연','양승호','백지은','홍성준','유미래','전영수','천지원','고태양','황보람','안시우','마현정'];
  const bRows = [];
  for (let i = 0; i < 30; i++) {
    bRows.push({ event_id: eventId, company_name: buyerNames[i], buyer_name: buyerPersons[i], country: countries[i % 15], booth_number: 'B' + String(i + 1).padStart(3, '0'), email: 'buyer' + (i + 1) + '@example.com' });
  }
  const { data: buyers } = await admin.from('buyers').insert(bRows).select('id');

  // 셀러 15명
  const sKr = ['한국전자','세계무역','글로벌텍','동양식품','미래에너지','코리아패션','서울바이오','한빛소재','대한화학','아시아IT','그린테크','블루오션','스카이라인','오리엔트','퍼시픽'];
  const sRows = [];
  for (let i = 0; i < 15; i++) {
    sRows.push({ event_id: eventId, company_name: 'Seller Inc ' + (i + 1), company_name_kr: sKr[i], contact_name: '담당자' + (i + 1), email: 'seller' + (i + 1) + '@example.com' });
  }
  const { data: sellers } = await admin.from('sellers').insert(sRows).select('id');

  // 타임슬롯 27개
  const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
  const times = [
    { s: '09:00', e: '09:30' }, { s: '09:40', e: '10:10' }, { s: '10:20', e: '10:50' },
    { s: '11:00', e: '11:30' }, { s: '11:40', e: '12:10' }, { s: '13:00', e: '13:30' },
    { s: '13:40', e: '14:10' }, { s: '14:20', e: '14:50' }, { s: '15:00', e: '15:30' },
  ];
  const slotRows = [];
  let ord = 1;
  for (const d of dates) for (const t of times) slotRows.push({ event_id: eventId, date: d, start_time: t.s, end_time: t.e, slot_order: ord++ });
  const { data: slots } = await admin.from('time_slots').insert(slotRows).select('id');

  const bIds = buyers.map(b => b.id);
  const sIds = sellers.map(s => s.id);
  const slIds = slots.map(s => s.id);

  // 상담 270건
  const cRows = [];
  for (let si = 0; si < slIds.length; si++) {
    for (let j = 0; j < 10 && j < sIds.length; j++) {
      cRows.push({ event_id: eventId, time_slot_id: slIds[si], buyer_id: bIds[(si * 10 + j) % bIds.length], seller_id: sIds[j], interpreter_id: iIds[(si * 10 + j) % iIds.length], status: 'scheduled' });
    }
  }
  let ins = 0;
  for (let i = 0; i < cRows.length; i += 50) {
    const { error } = await admin.from('consultations').insert(cRows.slice(i, i + 50));
    if (!error) ins += Math.min(50, cRows.length - i);
  }
  console.log('Consultations:', ins);

  // 양식
  const fields = [
    { key: 'consultation_product', label: '상담품목', type: 'text', required: true },
    { key: 'trade_possibility', label: '거래가능성', type: 'select', options: ['상', '중', '하'], required: true },
    { key: 'matching_satisfaction', label: '매칭만족도', type: 'select', options: ['매우만족', '만족', '보통', '불만족', '매우불만족'], required: true },
    { key: 'consultation_amount', label: '수출상담액(USD)', type: 'number', required: false },
    { key: 'contract_push_amount', label: '계약추진액(USD)', type: 'number', required: false },
    { key: 'onsite_contract_amount', label: '현장계약액(USD)', type: 'number', required: false },
    { key: 'consultation_detail', label: '상담세부내용', type: 'textarea', required: true },
    { key: 'mou_yn', label: 'MOU여부', type: 'select', options: ['O', 'X'], required: false },
  ];
  await admin.from('report_templates').insert({ event_id: eventId, fields });
  console.log('Template OK');

  // 상담일지 40건
  const { data: cons } = await admin.from('consultations').select('id, interpreter_id').eq('event_id', eventId).limit(40);
  const products = ['반도체', '디스플레이', '배터리', '화장품', '식품', '의류', '자동차부품', '의료기기', 'IoT센서', '전자부품', '바이오신약', '의약품원료', '진단키트', '건강기능식품', '의료장비'];
  const details = [
    '바이어가 샘플 요청. 2주 내 발송 예정.',
    '기존 거래 확대 논의. 연간 계약 가능성 높음.',
    '신규 시장 진출 상담. 현지 규제 확인 필요.',
    '기술 사양 맞춤 생산 가능 여부 논의.',
    '가격 경쟁력 우수. 초도 물량 500개 확정.',
    '품질 인증 관련 문의. FDA 승인 필요.',
    '독점 공급 계약 논의. 3년 장기계약 제안.',
    'OEM 생산 커스터마이징 요청.',
    '현지 유통망 활용 제안.',
    '시장 조사 목적 방문.',
  ];
  const statuses = [
    ...Array(12).fill('approved'),
    ...Array(10).fill('submitted'),
    ...Array(4).fill('revision_requested'),
    ...Array(2).fill('rejected'),
    ...Array(6).fill('draft'),
    ...Array(6).fill(null),
  ];

  let rc = 0;
  for (let i = 0; i < cons.length; i++) {
    const st = statuses[i];
    if (!st) continue;
    const ca = Math.floor(Math.random() * 500000) + 10000;
    const cp = Math.floor(ca * (0.2 + Math.random() * 0.5));
    const oc = st === 'approved' ? Math.floor(cp * (0.3 + Math.random() * 0.5)) : (Math.random() > 0.5 ? Math.floor(cp * Math.random() * 0.3) : 0);
    const data = {
      consultation_product: products[i % 15],
      trade_possibility: ['상', '중', '하'][i % 3],
      matching_satisfaction: ['매우만족', '만족', '보통', '불만족', '매우불만족'][i % 5],
      consultation_amount: ca,
      contract_push_amount: cp,
      onsite_contract_amount: oc,
      consultation_detail: details[i % 10],
      mou_yn: i % 5 === 0 ? 'O' : 'X',
    };
    const isSub = ['approved', 'submitted', 'revision_requested', 'rejected'].includes(st);
    let adminComment = null;
    if (st === 'revision_requested') adminComment = '금액 확인 필요합니다. 바이어 컨펌 후 수정해주세요.';
    if (st === 'rejected') adminComment = '상담 내용이 부실합니다. 재작성이 필요합니다.';

    await admin.from('consultation_reports').insert({
      consultation_id: cons[i].id,
      interpreter_id: cons[i].interpreter_id,
      data,
      submitted: isSub,
      submitted_at: isSub ? new Date(Date.now() - Math.random() * 86400000 * 3).toISOString() : null,
      report_status: st,
      admin_comment: adminComment,
      reviewed_at: ['approved', 'revision_requested', 'rejected'].includes(st) ? new Date(Date.now() - Math.random() * 86400000).toISOString() : null,
    });
    if (isSub) await admin.from('consultations').update({ status: 'completed' }).eq('id', cons[i].id);
    else await admin.from('consultations').update({ status: 'in_progress' }).eq('id', cons[i].id);
    rc++;
  }
  console.log('Reports:', rc, 'Done!');
})();
