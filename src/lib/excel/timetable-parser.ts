import { readSheetRows } from './reader';

export interface ParsedTimeSlot {
  date: string;
  start_time: string;
  end_time: string;
  slot_order: number;
}

export interface ParsedBuyer {
  row_number: number;
  company_name: string;
  buyer_name: string;
  country: string;
  booth_number: string;
  phone: string;
  email: string;
}

export interface ParsedSeller {
  company_name: string;
  company_name_kr: string;
  contact_name: string;
  contact_phone: string;
  office_phone: string;
  email: string;
}

export interface ParsedConsultation {
  buyer_index: number;
  slot_index: number;
  seller: ParsedSeller;
}

export interface TimetableParseResult {
  time_slots: ParsedTimeSlot[];
  buyers: ParsedBuyer[];
  consultations: ParsedConsultation[];
  sellers: ParsedSeller[];
}

/** 타임슬롯 문자열 파싱 ("10:00 - 10:40") */
function parseTimeRange(str: string): { start_time: string; end_time: string } | null {
  const match = str.match(/(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return { start_time: match[1], end_time: match[2] };
}

/** 날짜 문자열 정규화 → YYYY-MM-DD */
function normalizeDate(str: string): string {
  // "2025-05-14" 형태
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // "05-14" 형태
  const shortMatch = str.match(/^(\d{2})-(\d{2})$/);
  if (shortMatch) return `${new Date().getFullYear()}-${shortMatch[1]}-${shortMatch[2]}`;
  // "2025.05.14" 또는 "2025/05/14"
  const dotMatch = str.match(/^(\d{4})[./](\d{2})[./](\d{2})$/);
  if (dotMatch) return `${dotMatch[1]}-${dotMatch[2]}-${dotMatch[3]}`;
  return str;
}

/** 셀에서 셀러 정보 파싱 (줄바꿈 구분) */
function parseSeller(cellValue: string | undefined | null): ParsedSeller | null {
  if (!cellValue || typeof cellValue !== 'string' || cellValue.trim() === '') return null;

  const lines = cellValue.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const seller: ParsedSeller = {
    company_name: lines[0] || '',
    company_name_kr: lines[1] || '',
    contact_name: '',
    contact_phone: '',
    office_phone: '',
    email: '',
  };

  if (lines[2]) seller.contact_name = lines[2];

  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('@')) seller.email = line;
    else if (!seller.contact_phone) seller.contact_phone = line;
    else seller.office_phone = line;
  }

  return seller;
}

/** 바이어 셀 파싱 (줄바꿈 구분) */
function parseBuyerCell(cellValue: string | undefined | null): { company_name: string; phone: string; email: string } {
  if (!cellValue || typeof cellValue !== 'string') return { company_name: '', phone: '', email: '' };

  const lines = cellValue.split('\n').map(l => l.trim()).filter(Boolean);
  const company_name = lines[0] || '';
  let phone = '';
  let email = '';

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes('@')) email = lines[i];
    else if (/[\d+\-\s]/.test(lines[i]) && !phone) phone = lines[i];
  }

  return { company_name, phone, email };
}

/** 헤더 키워드 매칭으로 열 역할 판별 */
function detectColumnRole(header: string): 'number' | 'buyer' | 'country' | 'booth' | 'date' | 'ignore' | null {
  const h = header.toLowerCase();
  if (h.includes('번호') || h === 'no' || h === 'no.' || h === '#') return 'number';
  if (h.includes('회사') || h.includes('바이어') || h.includes('buyer') || h.includes('업체')) return 'buyer';
  if (h.includes('국가') || h.includes('무역관') || h.includes('country') || h.includes('지역')) return 'country';
  if (h.includes('부스') || h.includes('booth') || h.includes('인식') || h.includes('위치')) return 'booth';
  return null;
}

/** 셀이 날짜인지 판별 */
function isDateCell(val: string): boolean {
  return /\d{2,4}[-./]\d{2}([-./]\d{2})?/.test(val);
}

/**
 * 타임테이블 엑셀 파싱 메인 함수
 * 헤더와 시간 패턴을 자동 인식하여 유연하게 파싱
 */
export async function parseTimetableExcel(buffer: ArrayBuffer): Promise<TimetableParseResult> {
  const data = await readSheetRows(buffer);

  if (data.length < 3) {
    throw new Error('엑셀 파일에 최소 3행이 필요합니다');
  }

  // === Step 1: 헤더 행과 시간 행 자동 탐지 ===
  let headerRowIdx = -1;
  let timeRowIdx = -1;

  for (let r = 0; r < Math.min(10, data.length); r++) {
    const row = data[r];
    if (!row) continue;

    // 시간 패턴이 있는 행 = 타임슬롯 행
    const timeCount = row.filter(c => c && parseTimeRange(String(c))).length;
    if (timeCount >= 2) {
      timeRowIdx = r;
      // 헤더는 보통 시간 행 바로 위 또는 같은 행
      if (headerRowIdx === -1) headerRowIdx = Math.max(0, r - 1);
      break;
    }

    // 키워드가 있는 행 = 헤더 행
    const keywordCount = row.filter(c => c && detectColumnRole(String(c))).length;
    if (keywordCount >= 2 && headerRowIdx === -1) {
      headerRowIdx = r;
    }
  }

  if (headerRowIdx === -1) throw new Error('헤더 행을 찾을 수 없습니다');
  if (timeRowIdx === -1) throw new Error('시간 슬롯 행을 찾을 수 없습니다 (예: 10:00 - 10:40)');

  const headerRow = data[headerRowIdx];
  const timeRow = data[timeRowIdx];

  // === Step 2: 열 역할 자동 매핑 ===
  let numberCol = -1;
  let buyerCol = -1;
  let countryCol = -1;
  let boothCol = -1;
  let dataStartCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    if (!val) continue;
    const role = detectColumnRole(String(val));
    if (role === 'number' && numberCol === -1) numberCol = c;
    if (role === 'buyer' && buyerCol === -1) buyerCol = c;
    if (role === 'country' && countryCol === -1) countryCol = c;
    if (role === 'booth' && boothCol === -1) boothCol = c;
  }

  // 바이어 열이 없으면 번호 다음 열 사용
  if (buyerCol === -1) buyerCol = numberCol >= 0 ? numberCol + 1 : 0;

  // === Step 3: 날짜 추출 ===
  let dateStr = '';
  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    if (val && isDateCell(String(val))) {
      dateStr = normalizeDate(String(val));
      if (dataStartCol === -1) dataStartCol = c;
      break;
    }
  }

  // 날짜를 못 찾으면 시간이 시작되는 열부터
  if (dataStartCol === -1) {
    for (let c = 0; c < timeRow.length; c++) {
      if (timeRow[c] && parseTimeRange(String(timeRow[c]))) {
        dataStartCol = c;
        break;
      }
    }
  }

  if (dataStartCol === -1) throw new Error('타임슬롯 데이터 시작 열을 찾을 수 없습니다');
  if (!dateStr) dateStr = new Date().toISOString().split('T')[0]; // 날짜 없으면 오늘

  // === Step 4: 타임슬롯 파싱 ===
  const time_slots: ParsedTimeSlot[] = [];
  for (let c = dataStartCol; c < timeRow.length; c++) {
    const val = timeRow[c];
    if (!val) continue;
    const parsed = parseTimeRange(String(val));
    if (parsed) {
      time_slots.push({
        date: dateStr,
        start_time: parsed.start_time,
        end_time: parsed.end_time,
        slot_order: time_slots.length + 1,
      });
    }
  }

  if (time_slots.length === 0) throw new Error('타임슬롯을 파싱할 수 없습니다');

  // === Step 5: 데이터 행 시작 (헤더/시간 행 다음) ===
  const dataStartRow = Math.max(headerRowIdx, timeRowIdx) + 1;

  // === Step 6: 바이어 + 상담 파싱 ===
  const buyers: ParsedBuyer[] = [];
  const consultations: ParsedConsultation[] = [];
  const sellersMap = new Map<string, ParsedSeller>();

  for (let r = dataStartRow; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    // 바이어 열에 데이터가 있는지 확인
    const buyerCellVal = row[buyerCol];
    if (!buyerCellVal || String(buyerCellVal).trim() === '') continue;

    const buyerInfo = parseBuyerCell(String(buyerCellVal));
    const buyer: ParsedBuyer = {
      row_number: numberCol >= 0 ? (Number(row[numberCol]) || r - dataStartRow + 1) : r - dataStartRow + 1,
      company_name: buyerInfo.company_name,
      buyer_name: buyerInfo.company_name, // 같은 셀에서 첫 줄
      country: countryCol >= 0 ? String(row[countryCol] || '') : '',
      booth_number: boothCol >= 0 ? String(row[boothCol] || '') : '',
      phone: buyerInfo.phone,
      email: buyerInfo.email,
    };
    buyers.push(buyer);
    const buyerIndex = buyers.length - 1;

    // 각 타임슬롯의 셀러 매칭
    for (let s = 0; s < time_slots.length; s++) {
      const cellValue = row[dataStartCol + s];
      const seller = parseSeller(cellValue ? String(cellValue) : null);
      if (seller) {
        const sellerKey = seller.email || `${seller.company_name}_${seller.contact_name}`;
        if (!sellersMap.has(sellerKey)) sellersMap.set(sellerKey, seller);
        consultations.push({
          buyer_index: buyerIndex,
          slot_index: s,
          seller: sellersMap.get(sellerKey)!,
        });
      }
    }
  }

  return {
    time_slots,
    buyers,
    consultations,
    sellers: Array.from(sellersMap.values()),
  };
}
