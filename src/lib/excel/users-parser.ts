import { readSheetRows } from './reader';
import { isValidCountryCode } from '@/lib/constants/countries';
import { getLast4Digits } from '@/lib/utils/password';
import type { UserRole } from '@/types';

export interface ParsedUser {
  row_number: number;
  role: UserRole;
  name: string;
  email: string;
  contact_email?: string;
  phone: string;
  company_name?: string;
  country?: string;
  language?: string;
  extra_info: Record<string, unknown>;
  password: string;
}

export interface UserParseError {
  row: number;
  field: string;
  message: string;
}

export interface UserParseResult {
  users: ParsedUser[];
  errors: UserParseError[];
}

const ROLE_MAP: Record<string, UserRole> = {
  admin: 'admin',
  buyer: 'buyer',
  seller: 'seller',
  interpreter: 'interpreter',
  관리자: 'admin',
  바이어: 'buyer',
  셀러: 'seller',
  통역사: 'interpreter',
};

// 헤더 키워드 매핑
const COLUMN_PATTERNS: Record<string, (h: string) => boolean> = {
  type: (h) => /유형|권한|역할|type|role/i.test(h),
  name: (h) => /^이름|^name/i.test(h),
  login_email: (h) => /아이디|id.*이메일|id.*email|login/i.test(h),
  contact_email: (h) => /^이메일|^email|연락.*이메일/i.test(h) && !/아이디/i.test(h),
  phone: (h) => /연락처|전화|phone|mobile/i.test(h),
  company: (h) => /회사명|회사|company/i.test(h),
  country: (h) => /국가|country|nation/i.test(h),
  lang1: (h) => /통역.*언어.*1|언어.*1|language.*1|통역언어$/i.test(h),
  lang2: (h) => /통역.*언어.*2|언어.*2|language.*2/i.test(h),
};

// extra_info에 들어갈 나머지 컬럼 키워드
const EXTRA_LABELS = [
  '회사소개', '홈페이지', '회사소개서', '관심분야', '상담회 품목', '품목',
  '호텔명', '호텔 주소', '호텔', '입국 항공사', '항공사', '입국 항공기',
  '항공기', '입국 날짜', '입국', '매출액', '매출', 'revenue',
];

export async function parseUsersExcel(buffer: ArrayBuffer): Promise<UserParseResult> {
  const data = await readSheetRows(buffer);

  if (data.length < 2) throw new Error('최소 2행(헤더+데이터)이 필요합니다');

  // 헤더 분석
  const rawHeaders = data[0].map(h => String(h || '').trim());
  const columnMap: Record<string, number> = {};
  const extraColumns: { index: number; label: string }[] = [];

  rawHeaders.forEach((header, idx) => {
    if (!header) return;
    const lower = header.toLowerCase();

    // 매핑된 컬럼 찾기
    let matched = false;
    for (const [key, matcher] of Object.entries(COLUMN_PATTERNS)) {
      if (matcher(header) && !(key in columnMap)) {
        columnMap[key] = idx;
        matched = true;
        break;
      }
    }

    // 매핑되지 않은 컬럼: 연번은 무시, 나머지는 extra_info로
    if (!matched && !/연번|번호|^#|^no\.?$/i.test(lower)) {
      extraColumns.push({ index: idx, label: header });
    }
  });

  // login_email이 없고 contact_email만 있으면 그걸 로그인용으로 사용
  if (!('login_email' in columnMap) && 'contact_email' in columnMap) {
    columnMap.login_email = columnMap.contact_email;
    delete columnMap.contact_email;
  }

  if (!('name' in columnMap)) throw new Error('이름 열을 찾을 수 없습니다');
  if (!('login_email' in columnMap)) throw new Error('이메일(아이디) 열을 찾을 수 없습니다');

  const users: ParsedUser[] = [];
  const errors: UserParseError[] = [];
  const emailSet = new Set<string>();

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row || row.every(cell => !cell)) continue; // 빈 행 건너뛰기

    const rowNum = r + 1;
    const typeRaw = columnMap.type !== undefined ? String(row[columnMap.type] || '').trim().toLowerCase() : '';
    const name = columnMap.name !== undefined ? String(row[columnMap.name] || '').trim() : '';
    const email = columnMap.login_email !== undefined ? String(row[columnMap.login_email] || '').trim().toLowerCase() : '';
    const contactEmail = columnMap.contact_email !== undefined ? String(row[columnMap.contact_email] || '').trim() : undefined;
    const phone = columnMap.phone !== undefined ? String(row[columnMap.phone] || '').trim() : '';
    const companyName = columnMap.company !== undefined ? String(row[columnMap.company] || '').trim() : undefined;
    const country = columnMap.country !== undefined ? String(row[columnMap.country] || '').trim().toUpperCase() : undefined;
    const lang1 = columnMap.lang1 !== undefined ? String(row[columnMap.lang1] || '').trim() : '';
    const lang2 = columnMap.lang2 !== undefined ? String(row[columnMap.lang2] || '').trim() : '';

    // 유형 매핑
    const role = ROLE_MAP[typeRaw];
    if (!role) {
      if (typeRaw) {
        errors.push({ row: rowNum, field: '유형', message: `알 수 없는 유형: "${typeRaw}" (바이어/셀러/통역사/관리자 또는 BUYER/SELLER/INTERPRETER/ADMIN)` });
      } else {
        errors.push({ row: rowNum, field: '유형', message: '유형(권한)이 비어있습니다' });
      }
      continue;
    }

    // 필수 필드 검증
    if (!name) { errors.push({ row: rowNum, field: '이름', message: '이름이 비어있습니다' }); continue; }
    if (!email) { errors.push({ row: rowNum, field: '이메일', message: '이메일이 비어있습니다' }); continue; }

    // 이메일 형식 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: rowNum, field: '이메일', message: `이메일 형식이 올바르지 않습니다: ${email}` });
      continue;
    }

    // 이메일 중복 검증 (엑셀 내)
    if (emailSet.has(email)) {
      errors.push({ row: rowNum, field: '이메일', message: `엑셀 내 중복 이메일: ${email}` });
      continue;
    }
    emailSet.add(email);

    // 국가코드 검증
    if (country && !isValidCountryCode(country)) {
      errors.push({ row: rowNum, field: '국가', message: `유효하지 않은 국가코드: ${country}` });
      continue;
    }

    // 언어 합치기
    const language = [lang1, lang2].filter(Boolean).join(', ') || undefined;

    // extra_info 구성
    const extra_info: Record<string, unknown> = {};
    if (contactEmail && contactEmail !== email) {
      extra_info.contact_email = contactEmail;
    }
    for (const col of extraColumns) {
      const val = row[col.index];
      if (val) extra_info[col.label] = val;
    }

    // 비밀번호
    const password = phone ? getLast4Digits(phone) : '0000';

    users.push({
      row_number: rowNum,
      role,
      name,
      email,
      contact_email: contactEmail,
      phone,
      company_name: companyName || undefined,
      country: country || undefined,
      language,
      extra_info,
      password,
    });
  }

  return { users, errors };
}
