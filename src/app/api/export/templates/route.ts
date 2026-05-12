import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { COUNTRIES } from '@/lib/constants/countries';

const HEADER_STYLE = {
  fill: { fgColor: { rgb: '1E3A5F' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  border: {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const },
  },
};

function applyHeaders(ws: XLSX.WorkSheet, row: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
    if (cell) cell.s = HEADER_STYLE;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const type = request.nextUrl.searchParams.get('type');
  if (!type) return NextResponse.json({ error: 'type 파라미터가 필요합니다' }, { status: 400 });

  try {
    const wb = XLSX.utils.book_new();
    let filename = '';

    switch (type) {
      case 'users': filename = '사용자_일괄등록_양식.xlsx'; buildUsersTemplate(wb); break;
      case 'timetable': filename = '타임테이블_양식.xlsx'; buildTimetableTemplate(wb); break;
      case 'interpreters': filename = '통역사_등록_양식.xlsx'; buildInterpretersTemplate(wb); break;
      case 'report-template': filename = '상담일지_양식_샘플.xlsx'; buildReportTemplate(wb); break;
      default: return NextResponse.json({ error: '유효하지 않은 type입니다' }, { status: 400 });
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '양식 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildUsersTemplate(wb: XLSX.WorkBook) {
  const headers = [
    '유형(권한) - 필수', '이름 - 필수', '아이디(이메일) - 필수',
    '이메일(연락받을 이메일)', '연락처 - 필수', '회사명', '국가',
    '통역언어1', '통역언어2', '회사소개', '홈페이지',
    '회사소개서 (url 형태)', '관심분야', '상담회 품목',
    '호텔명', '호텔 주소', '입국 항공사', '입국 항공기 번호',
    '입국 날짜', '매출액 범위(USD)',
  ];

  const rows = [
    headers,
    ['BUYER', '홍길동', 'hong@example.com', 'hong@example.com', '821012345678', '한국무역', 'KR', '', '', '무역 전문 업체', 'https://example.com', '', '건설', '건설자재', '', '', '', '', '', ''],
    ['SELLER', '김철수', 'kim@example.com', 'kim@example.com', '821098765432', '수출주식회사', 'KR', '', '', '수출 전문', '', '', '전자', '반도체', '', '', '', '', '', '10억 ~ 100억 미만'],
    ['INTERPRETER', '이영희', 'lee@example.com', 'lee@example.com', '821055556666', '', 'KR', 'zh', 'ko', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyHeaders(ws, 0, headers.length);

  // 유형 드롭다운
  ws['!dataValidation'] = [{ sqref: 'A2:A500', type: 'list', formula1: '"바이어,셀러,통역사,관리자,BUYER,SELLER,INTERPRETER,ADMIN"' }];
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 1.5, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, '사용자 리스트');

  // Country 시트
  const countryRows = [['Code', 'Name_ko', 'Name_en'], ...COUNTRIES.map(c => [c.code, c.name_ko, c.name_en])];
  const cs = XLSX.utils.aoa_to_sheet(countryRows);
  applyHeaders(cs, 0, 3);
  cs['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, cs, 'Country');

  // 안내 시트
  const guideRows = [
    ['사용자 일괄 등록 양식 작성 안내'],
    [],
    ['1. "사용자 리스트" 시트에 데이터를 입력해주세요.'],
    ['2. 유형(권한): 바이어/셀러/통역사/관리자 또는 BUYER/SELLER/INTERPRETER/ADMIN 중 선택'],
    ['3. 이름, 아이디(이메일), 연락처는 필수입니다.'],
    ['4. 국가: Country 시트의 Code 값을 사용해주세요 (예: KR, CN, US)'],
    ['5. 초기 비밀번호: 연락처 뒤 4자리로 자동 설정됩니다.'],
    ['6. 첫 로그인 시 비밀번호를 변경해야 합니다.'],
  ];
  const gs = XLSX.utils.aoa_to_sheet(guideRows);
  gs['!cols'] = [{ wch: 60 }];
  const titleCell = gs[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };
  XLSX.utils.book_append_sheet(wb, gs, '작성 안내');
}

function buildTimetableTemplate(wb: XLSX.WorkBook) {
  const row1 = ['번호', '회사명', '무역관', '부스', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14'];
  const row2 = ['', '', '', '', '10:00 - 10:40', '10:50 - 11:30', '11:40 - 12:20', '13:30 - 14:10', '14:20 - 15:00', '15:10 - 15:50', '16:00 - 16:40', '16:50 - 17:30'];
  const row3 = [1, 'Sample Buyer Corp\n\n821012345678\nbuyer@example.com', '서울', 'A01',
    '수출주식회사\n(주)수출\n홍길동\n010-1234-5678\n02-123-4567\nhong@example.com',
    '한국무역\n한국무역(주)\n김철수\n010-9876-5432\n02-987-6543\nkim@example.com',
    '', '', '', '', '', ''];
  const row4 = [2, 'Global Trading Co\n\n821098765432\ntrading@example.com', '도쿄', 'A02', '', '', '', '', '', '', '', ''];

  const ws = XLSX.utils.aoa_to_sheet([row1, row2, row3, row4]);

  // 헤더 스타일
  applyHeaders(ws, 0, 12);
  applyHeaders(ws, 1, 12);

  // A~D 병합
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
  ];

  ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 10 }, { wch: 8 }, ...Array(8).fill({ wch: 28 })];
  ws['!rows'] = [undefined, undefined, { hpt: 80 }, { hpt: 80 }];

  XLSX.utils.book_append_sheet(wb, ws, '상담테이블');

  // 안내 시트
  const guideRows = [
    ['상담테이블 양식 작성 안내'], [],
    ['1. 1행: 날짜 (예: 05-14), 2행: 시간대 (예: 10:00 - 10:40)'],
    ['2. 1~4열: 번호, 바이어 회사명, 무역관, 부스번호'],
    ['3. 바이어 정보 (2열): 회사명(영문) + 줄바꿈 + 전화번호 + 줄바꿈 + 이메일'],
    ['4. 셀러 정보 (5열~): 각 셀에 아래 형식으로 입력'],
    ['   회사명(영문)'], ['   회사명(한글)'], ['   담당자명(영문) (한글명)'],
    ['   핸드폰'], ['   사무실전화'], ['   이메일'], [],
    ['5. 빈 셀 = 해당 시간 상담 없음'],
    ['6. 업로드 시 바이어/셀러 계정이 자동 생성됩니다.'],
  ];
  const gs = XLSX.utils.aoa_to_sheet(guideRows);
  gs['!cols'] = [{ wch: 60 }];
  const titleCell = gs[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };
  XLSX.utils.book_append_sheet(wb, gs, '작성 안내');
}

function buildInterpretersTemplate(wb: XLSX.WorkBook) {
  const rows = [
    ['이름', '이메일', '전화번호', '통역언어'],
    ['김통역', 'kim@example.com', '010-1111-2222', '영어'],
    ['이통역', 'lee@example.com', '010-3333-4444', '중국어'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyHeaders(ws, 0, 4);
  ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, '통역사');
}

function buildReportTemplate(wb: XLSX.WorkBook) {
  const rows = [
    ['상담품목', '거래가능성(상,중,하)', '매칭만족도', '수출상담액(USD)', '계약추진액(USD)', '현장계약액(USD)', '상담세부내용', 'MOU여부'],
    ['전자부품', '상', '4', '50000', '30000', '0', '상세 내용 기입', '아니오'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyHeaders(ws, 0, 8);
  ws['!cols'] = rows[0].map(h => ({ wch: Math.max((h as string).length * 1.5, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, '상담일지 양식');

  const guideRows = [
    ['상담일지 양식 업로드 안내'], [],
    ['1. 첫 번째 행은 헤더(필드명)입니다.'],
    ['2. 두 번째 행부터 예시 데이터를 넣어주세요.'],
    ['3. 시스템이 헤더를 분석하여 자동으로 필드 타입을 결정합니다.'],
    ['   - 괄호 안에 옵션이 있으면 선택형 (예: 거래가능성(상,중,하))'],
    ['   - 금액/숫자 포함 → 숫자형'],
    ['   - 내용/비고 → 텍스트 영역(긴 글)'],
  ];
  const gs = XLSX.utils.aoa_to_sheet(guideRows);
  gs['!cols'] = [{ wch: 60 }];
  const titleCell = gs[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };
  XLSX.utils.book_append_sheet(wb, gs, '작성 안내');
}
