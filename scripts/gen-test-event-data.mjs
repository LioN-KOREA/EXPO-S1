/**
 * 테스트 상담회 데이터 생성 스크립트.
 * 실행: node scripts/gen-test-event-data.mjs
 * 출력: output/사용자_일괄등록_테스트.xlsx, output/타임테이블_테스트.xlsx
 *
 * 시연 시나리오 (2026-05-28 단일일자):
 * - 셀러 10명, 바이어 20명 (통역사는 사용자 직접 추가)
 * - 타임테이블 10:00-16:00, 60분 슬롯 6개
 * - 바이어 1-10 은 풍성한 미팅 (6 슬롯 모두), 바이어 11-20 은 빈 행
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'output');
fs.mkdirSync(outDir, { recursive: true });

// 한국 이름 풀 (테스트 데이터 한국어 필수)
const SELLER_NAMES = ['김수출', '이대박', '박무역', '최세계', '정상품', '강해외', '조국제', '윤글로벌', '장수주', '임선적'];
const BUYER_NAMES = ['홍구매', '서신영', '문상선', '한도매', '오해외', '권바이어', '신무역', '백선구', '류재고', '남공급',
                     '심구매2', '노상호', '구신뢰', '안협력', '천계약', '양상담', '하수입', '주상품', '진해외', '엄품질'];
const SELLER_COMPANIES = ['수출주식회사', '글로벌수출', '한국무역', '세계상사', '대박상품', '해외판로', '국제상사', '글로벌선', '수주코리아', '선적무역'];
const BUYER_COMPANIES = ['(주)구매기업', '서신영상사', '문상선바이어', '한도매무역', '오해외구매', '권바이어상사', '신무역(주)', '백선구글로벌', '류재고상사', '남공급바이어',
                         '심구매기업', '노상호상사', '구신뢰무역', '안협력바이어', '천계약기업', '양상담상사', '하수입무역', '주상품기업', '진해외바이어', '엄품질상사'];
const BUYER_COUNTRIES = ['CN', 'JP', 'US', 'VN', 'TH', 'ID', 'MY', 'PH', 'IN', 'TW',
                         'CN', 'JP', 'US', 'VN', 'TH', 'ID', 'MY', 'PH', 'IN', 'TW'];
const BUYER_REGIONS = ['상하이', '도쿄', '뉴욕', '호치민', '방콕', '자카르타', '쿠알라룸푸르', '마닐라', '뭄바이', '타이베이',
                       '베이징', '오사카', 'LA', '하노이', '치앙마이', '발리', '페낭', '세부', '델리', '가오슝'];
const INTEREST_ITEMS = ['전자부품', '반도체', '디스플레이', '자동차부품', '화장품', '식품', '의류', '건설자재', '의료기기', '플라스틱'];

function applyHeaderStyle(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
}

// =================================================================
// 1. 사용자 일괄 등록 엑셀
// =================================================================
async function buildUsersExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('사용자 리스트');

  const headers = [
    '유형(권한) - 필수', '이름 - 필수', '아이디(이메일) - 필수',
    '이메일(연락받을 이메일)', '연락처 - 필수', '회사명', '국가',
    '통역언어1', '통역언어2', '회사소개', '홈페이지',
    '회사소개서 (url 형태)', '관심분야', '상담회 품목',
    '호텔명', '호텔 주소', '입국 항공사', '입국 항공기 번호',
    '입국 날짜', '매출액 범위(USD)',
  ];
  applyHeaderStyle(ws.addRow(headers));

  // 셀러 10명
  for (let i = 0; i < 10; i++) {
    const name = SELLER_NAMES[i];
    const company = SELLER_COMPANIES[i];
    const idx = String(i + 1).padStart(2, '0');
    ws.addRow([
      'SELLER', name, `seller${idx}@excon-test.kr`, `seller${idx}@excon-test.kr`,
      `8210${20000000 + i * 1111111}`, company, 'KR', '', '', `${company} - 테스트 셀러`,
      'https://excon-test.kr', '', INTEREST_ITEMS[i], INTEREST_ITEMS[i],
      '', '', '', '', '', '10억 ~ 100억 미만',
    ]);
  }

  // 바이어 20명
  for (let i = 0; i < 20; i++) {
    const name = BUYER_NAMES[i];
    const company = BUYER_COMPANIES[i];
    const country = BUYER_COUNTRIES[i];
    const idx = String(i + 1).padStart(2, '0');
    ws.addRow([
      'BUYER', name, `buyer${idx}@excon-test.kr`, `buyer${idx}@excon-test.kr`,
      `8210${30000000 + i * 1234567}`, company, country, '', '', `${company} - 테스트 바이어`,
      'https://excon-test.kr', '', INTEREST_ITEMS[i % 10], INTEREST_ITEMS[i % 10],
      '', '', '', '', '', '',
    ]);
  }

  // 유형 선택 데이터 유효성
  for (let i = 2; i <= 500; i++) {
    ws.getCell(`A${i}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"바이어,셀러,통역사,관리자,BUYER,SELLER,INTERPRETER,ADMIN"'],
    };
  }

  ws.columns = headers.map((h) => ({ width: Math.max(h.length * 1.5, 14) }));

  // 안내 시트
  const guide = wb.addWorksheet('작성 안내');
  guide.addRow(['테스트 상담회 — 사용자 일괄 등록']);
  guide.addRow([]);
  guide.addRow(['- 셀러 10명, 바이어 20명']);
  guide.addRow(['- 모든 계정 이메일: seller01@excon-test.kr ~ seller10, buyer01 ~ buyer20']);
  guide.addRow(['- 초기 비밀번호: 전화번호 뒷자리 (국가번호·지역번호 제외)']);
  guide.addRow(['- 통역사는 사용자가 직접 추가']);
  guide.getColumn(1).width = 60;
  guide.getRow(1).font = { bold: true, size: 13 };

  const outPath = path.join(outDir, '사용자_일괄등록_테스트.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ ${outPath}`);
}

// =================================================================
// 2. 타임테이블 엑셀
// =================================================================
async function buildTimetableExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('상담테이블');

  const DATE = '05-28';
  const SLOTS = [
    '10:00 - 11:00',
    '11:00 - 12:00',
    '12:00 - 13:00',
    '13:00 - 14:00',
    '14:00 - 15:00',
    '15:00 - 16:00',
  ];

  // 1행: 날짜 헤더 (A~D 고정 + 슬롯별 날짜 반복)
  ws.addRow(['번호', '회사명', '무역관', '부스', ...SLOTS.map(() => DATE)]);
  // 2행: 시간대
  ws.addRow(['', '', '', '', ...SLOTS]);

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('C1:C2');
  ws.mergeCells('D1:D2');

  applyHeaderStyle(ws.getRow(1));
  applyHeaderStyle(ws.getRow(2));

  ['A1', 'B1', 'C1', 'D1'].forEach(ref => {
    ws.getCell(ref).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // 셀러 정보 문자열 (각 셀)
  // 형식: 회사명(영문)\n회사명(한글)\n담당자명(영문) (한글명)\n핸드폰\n사무실전화\n이메일
  const sellerCell = (i) => {
    const name = SELLER_NAMES[i];
    const company = SELLER_COMPANIES[i];
    const idx = String(i + 1).padStart(2, '0');
    const phone = `010-${1000 + i * 111}-${2000 + i * 111}`.padStart(13, '0').slice(0, 13);
    return `${company}\n${company}\n${name} (${name})\n010-${String(1000 + i * 111).padStart(4,'0').slice(0,4)}-${String(2000 + i * 111).padStart(4,'0').slice(0,4)}\n02-${String(100 + i * 11).padStart(3,'0')}-${String(2000 + i * 111).padStart(4,'0').slice(0,4)}\nseller${idx}@excon-test.kr`;
  };

  const buyerCell = (i) => {
    const name = BUYER_NAMES[i];
    const company = BUYER_COMPANIES[i];
    const idx = String(i + 1).padStart(2, '0');
    return `${company}\n${name}\nbuyer${idx}@excon-test.kr`;
  };

  // 바이어 1-10: 6슬롯 모두 채움 (Latin square로 셀러 충돌 회피)
  for (let buyerIdx = 0; buyerIdx < 10; buyerIdx++) {
    const row = [
      buyerIdx + 1,
      buyerCell(buyerIdx),
      BUYER_REGIONS[buyerIdx],
      `A${String(buyerIdx + 1).padStart(2, '0')}`,
    ];
    for (let slot = 0; slot < 6; slot++) {
      const sellerIdx = (buyerIdx + slot) % 10;
      row.push(sellerCell(sellerIdx));
    }
    ws.addRow(row);
  }

  // 바이어 11-20: 빈 슬롯 (부스만 배정, 미팅은 admin 이 추후 배정)
  for (let buyerIdx = 10; buyerIdx < 20; buyerIdx++) {
    ws.addRow([
      buyerIdx + 1,
      buyerCell(buyerIdx),
      BUYER_REGIONS[buyerIdx],
      `B${String(buyerIdx - 9).padStart(2, '0')}`,
      '', '', '', '', '', '',
    ]);
  }

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 8;
  for (let i = 5; i <= 10; i++) ws.getColumn(i).width = 28;

  // 행 높이
  for (let i = 3; i <= 22; i++) ws.getRow(i).height = 90;

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
    });
  });

  // 안내 시트
  const guide = wb.addWorksheet('작성 안내');
  guide.addRow(['테스트 상담회 — 타임테이블']);
  guide.addRow([]);
  guide.addRow(['- 일자: 2026-05-28 단일 (시트 헤더는 05-28)']);
  guide.addRow(['- 슬롯: 10:00-16:00, 60분 6 슬롯']);
  guide.addRow(['- 바이어 1-10: 6 슬롯 모두 셀러 배정 (Latin square 패턴, 셀러 충돌 없음)']);
  guide.addRow(['- 바이어 11-20: 부스만 배정, 미팅은 admin 이 추후 추가']);
  guide.addRow(['- 셀러 10명 × 6 슬롯 = 60 미팅']);
  guide.addRow(['- 업로드 시 미존재 바이어/셀러 자동 생성 가능 (하지만 사용자 등록을 먼저 한 후 업로드 권장)']);
  guide.getColumn(1).width = 70;
  guide.getRow(1).font = { bold: true, size: 13 };

  const outPath = path.join(outDir, '타임테이블_테스트.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ ${outPath}`);
}

await buildUsersExcel();
await buildTimetableExcel();
console.log('\n작업 완료. output/ 폴더 확인.');
