import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { COUNTRIES } from '@/lib/constants/countries';
import { ensureAdmin } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await ensureAdmin(supabase);
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const type = request.nextUrl.searchParams.get('type');
  if (!type) {
    return NextResponse.json({ error: 'type 파라미터가 필요합니다' }, { status: 400 });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    let filename = '';

    switch (type) {
      case 'users':
        filename = '사용자_일괄등록_양식.xlsx';
        buildUsersTemplate(workbook);
        break;
      case 'timetable':
        filename = '타임테이블_양식.xlsx';
        buildTimetableTemplate(workbook);
        break;
      case 'interpreters':
        filename = '통역사_등록_양식.xlsx';
        buildInterpretersTemplate(workbook);
        break;
      case 'report-template':
        filename = '상담일지_양식_샘플.xlsx';
        buildReportTemplate(workbook);
        break;
      default:
        return NextResponse.json({ error: '유효하지 않은 type입니다' }, { status: 400 });
    }

    const buffer = await workbook.xlsx.writeBuffer();
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

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function buildUsersTemplate(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('사용자 리스트');

  const headers = [
    '유형(권한) - 필수', '이름 - 필수', '아이디(이메일) - 필수',
    '이메일(연락받을 이메일)', '연락처 - 필수', '회사명', '국가',
    '통역언어1', '통역언어2', '회사소개', '홈페이지',
    '회사소개서 (url 형태)', '관심분야', '상담회 품목',
    '호텔명', '호텔 주소', '입국 항공사', '입국 항공기 번호',
    '입국 날짜', '매출액 범위(USD)',
  ];
  const headerRow = ws.addRow(headers);
  applyHeaderStyle(headerRow);

  // 샘플 데이터
  ws.addRow([
    'BUYER', '홍길동', 'hong@example.com', 'hong@example.com',
    '821012345678', '한국무역', 'KR', '', '', '무역 전문 업체',
    'https://example.com', '', '건설', '건설자재',
    '', '', '', '', '', '',
  ]);
  ws.addRow([
    'SELLER', '김철수', 'kim@example.com', 'kim@example.com',
    '821098765432', '수출주식회사', 'KR', '', '', '수출 전문',
    '', '', '전자', '반도체',
    '', '', '', '', '', '10억 ~ 100억 미만',
  ]);
  ws.addRow([
    'INTERPRETER', '이영희', 'lee@example.com', 'lee@example.com',
    '821055556666', '', 'KR', 'zh', 'ko', '',
    '', '', '', '',
    '', '', '', '', '', '',
  ]);

  // 유형 선택 데이터 유효성
  for (let i = 2; i <= 500; i++) {
    ws.getCell(`A${i}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"바이어,셀러,통역사,관리자,BUYER,SELLER,INTERPRETER,ADMIN"'],
    };
  }

  // 열 너비
  ws.columns = headers.map((h) => ({ width: Math.max(h.length * 1.5, 14) }));

  // Country 시트
  const cs = workbook.addWorksheet('Country');
  const cHeaders = cs.addRow(['Code', 'Name_ko', 'Name_en']);
  applyHeaderStyle(cHeaders);
  COUNTRIES.forEach(c => cs.addRow([c.code, c.name_ko, c.name_en]));
  cs.columns = [{ width: 8 }, { width: 20 }, { width: 30 }];

  // 안내 시트
  const guide = workbook.addWorksheet('작성 안내');
  guide.addRow(['사용자 일괄 등록 양식 작성 안내']);
  guide.addRow([]);
  guide.addRow(['1. "사용자 리스트" 시트에 데이터를 입력해주세요.']);
  guide.addRow(['2. 유형(권한): 바이어/셀러/통역사/관리자 또는 BUYER/SELLER/INTERPRETER/ADMIN 중 선택']);
  guide.addRow(['3. 이름, 아이디(이메일), 연락처는 필수입니다.']);
  guide.addRow(['4. 국가: Country 시트의 Code 값을 사용해주세요 (예: KR, CN, US)']);
  guide.addRow(['5. 초기 비밀번호: 전화번호에서 국가코드·area code 제외한 subscriber number(예: 010-1234-5678 → 12345678, (212) 555-1234 → 5551234)로 자동 설정됩니다.']);
  guide.addRow(['6. 첫 로그인 시 비밀번호를 변경해야 합니다.']);
  guide.getColumn(1).width = 60;
  guide.getRow(1).font = { bold: true, size: 13 };
}

function buildTimetableTemplate(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('상담테이블');

  // 1행: 헤더 (A~D 고정 + 날짜)
  ws.addRow(['번호', '회사명', '무역관', '부스', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14', '05-14']);

  // 2행: 시간대 (A~D는 비움 — 병합될 영역)
  ws.addRow(['', '', '', '', '10:00 - 10:40', '10:50 - 11:30', '11:40 - 12:20', '13:30 - 14:10', '14:20 - 15:00', '15:10 - 15:50', '16:00 - 16:40', '16:50 - 17:30']);

  // A~D열 1-2행 셀 병합
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('C1:C2');
  ws.mergeCells('D1:D2');

  // 헤더 스타일 적용
  applyHeaderStyle(ws.getRow(1));
  applyHeaderStyle(ws.getRow(2));

  // 병합된 셀 가운데 정렬
  ['A1', 'B1', 'C1', 'D1'].forEach(ref => {
    ws.getCell(ref).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // 3행: 샘플 바이어 데이터
  ws.addRow([
    1,
    'Sample Buyer Corp\n\n821012345678\nbuyer@example.com',
    '서울',
    'A01',
    '수출주식회사\n(주)수출\n홍길동\n010-1234-5678\n02-123-4567\nhong@example.com',
    '한국무역\n한국무역(주)\n김철수\n010-9876-5432\n02-987-6543\nkim@example.com',
    '', '', '', '', '', '',
  ]);

  // 4행: 샘플 바이어 2
  ws.addRow([
    2,
    'Global Trading Co\n\n821098765432\ntrading@example.com',
    '도쿄',
    'A02',
    '', '', '', '', '', '', '', '',
  ]);

  // 열 너비
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 8;
  for (let i = 5; i <= 12; i++) ws.getColumn(i).width = 28;

  // 행 높이
  ws.getRow(3).height = 80;
  ws.getRow(4).height = 80;

  // 셀 줄바꿈 활성화
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
    });
  });

  // 안내 시트
  const guide = workbook.addWorksheet('작성 안내');
  guide.addRow(['상담테이블 양식 작성 안내']);
  guide.addRow([]);
  guide.addRow(['1. 1행: 날짜 (예: 05-14), 2행: 시간대 (예: 10:00 - 10:40)']);
  guide.addRow(['2. 1~4열: 번호, 바이어 회사명, 무역관, 부스번호']);
  guide.addRow(['3. 바이어 정보 (2열): 회사명(영문) + 줄바꿈 + 전화번호 + 줄바꿈 + 이메일']);
  guide.addRow(['4. 셀러 정보 (5열~): 각 셀에 아래 형식으로 입력']);
  guide.addRow(['   회사명(영문)']);
  guide.addRow(['   회사명(한글)']);
  guide.addRow(['   담당자명(영문) (한글명)']);
  guide.addRow(['   핸드폰']);
  guide.addRow(['   사무실전화']);
  guide.addRow(['   이메일']);
  guide.addRow([]);
  guide.addRow(['5. 빈 셀 = 해당 시간 상담 없음']);
  guide.addRow(['6. 업로드 시 바이어/셀러 계정이 자동 생성됩니다.']);
  guide.getColumn(1).width = 60;
  guide.getRow(1).font = { bold: true, size: 13 };
}

function buildInterpretersTemplate(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('통역사');

  const headers = ['이름', '이메일', '전화번호', '통역언어'];
  const headerRow = ws.addRow(headers);
  applyHeaderStyle(headerRow);

  ws.addRow(['김통역', 'kim@example.com', '010-1111-2222', '영어']);
  ws.addRow(['이통역', 'lee@example.com', '010-3333-4444', '중국어']);

  ws.columns = [{ width: 15 }, { width: 25 }, { width: 18 }, { width: 15 }];
}

function buildReportTemplate(workbook: ExcelJS.Workbook) {
  const ws = workbook.addWorksheet('상담일지 양식');

  const headers = ['상담품목', '거래가능성(상,중,하)', '매칭만족도', '수출상담액(USD)', '계약추진액(USD)', '현장계약액(USD)', '상담세부내용', 'MOU여부'];
  const headerRow = ws.addRow(headers);
  applyHeaderStyle(headerRow);

  ws.addRow(['전자부품', '상', '4', '50000', '30000', '0', '상세 내용 기입', '아니오']);

  ws.columns = headers.map((h) => ({ width: Math.max(h.length * 1.5, 14) }));

  // 안내
  const guide = workbook.addWorksheet('작성 안내');
  guide.addRow(['상담일지 양식 업로드 안내']);
  guide.addRow([]);
  guide.addRow(['1. 첫 번째 행은 헤더(필드명)입니다.']);
  guide.addRow(['2. 두 번째 행부터 예시 데이터를 넣어주세요.']);
  guide.addRow(['3. 시스템이 헤더를 분석하여 자동으로 필드 타입을 결정합니다.']);
  guide.addRow(['   - 괄호 안에 옵션이 있으면 선택형 (예: 거래가능성(상,중,하))']);
  guide.addRow(['   - 금액/숫자 포함 → 숫자형']);
  guide.addRow(['   - 내용/비고 → 텍스트 영역(긴 글)']);
  guide.getColumn(1).width = 60;
  guide.getRow(1).font = { bold: true, size: 13 };
}
