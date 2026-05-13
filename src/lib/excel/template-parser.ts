import { readSheetRows } from './reader';
import type { TemplateField, FieldType } from '@/types';

/**
 * 헤더 라벨에서 필드 타입 추론 (라벨 기반 힌트)
 */
function inferTypeFromLabel(label: string): FieldType | null {
  const l = label.toLowerCase();
  if (l.includes('일자') || l.includes('일시') || l.includes('날짜') || l.includes('date')) return 'date';
  if (l.includes('금액') || l.includes('액') && l.includes('usd')) return 'number';
  if (l.includes('내용') || l.includes('세부') || l.includes('비고') || l.includes('설명')) return 'textarea';
  if (l.includes('가능성') || l.includes('만족도') || l.includes('여부') || l.includes('mou')) return 'select';
  return null;
}

/**
 * 헤더 라벨에서 select 옵션 추출 (괄호 안 내용)
 */
function extractOptionsFromLabel(label: string): string[] | undefined {
  // "거래가능성(상, 중, 하)" → ["상", "중", "하"]
  const match = label.match(/\(([^)]+)\)/);
  if (match) {
    const options = match[1].split(/[,、/]/).map(s => s.trim()).filter(Boolean);
    if (options.length >= 2) return options;
  }
  // "MOU여부(O, X)" → ["O", "X"]
  // "우수상담여부" → ["Y", "N"]
  if (label.includes('여부') && !match) return ['O', 'X'];
  return undefined;
}

/**
 * 셀 값에서 필드 타입 추론 (데이터 기반)
 */
function inferTypeFromData(values: (string | number | null)[]): FieldType {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'text';

  const allNumbers = nonEmpty.every((v) => !isNaN(Number(v)));
  if (allNumbers) return 'number';

  const datePattern = /^\d{4}[-/]\d{2}[-/]\d{2}$/;
  const allDates = nonEmpty.every((v) => datePattern.test(String(v)));
  if (allDates) return 'date';

  const uniqueValues = new Set(nonEmpty.map(String));
  if (uniqueValues.size <= 5 && nonEmpty.length >= 2) return 'select';

  const avgLength = nonEmpty.reduce((sum: number, v) => sum + String(v).length, 0) / nonEmpty.length;
  if (avgLength > 100) return 'textarea';

  return 'text';
}

/**
 * 필드 키 생성
 */
function generateKey(label: string, index: number): string {
  const cleaned = label.replace(/[^a-zA-Z0-9가-힣_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return cleaned || `field_${index}`;
}

export interface TemplateParseResult {
  fields: TemplateField[];
  preview: Record<string, unknown>[];
}

/**
 * 상담일지 양식 엑셀 파싱
 * - 빈 행을 건너뛰고 첫 번째 데이터가 있는 행을 헤더로 인식
 * - 데이터가 없어도 헤더 라벨에서 타입 추론
 */
export async function parseTemplateExcel(buffer: ArrayBuffer): Promise<TemplateParseResult> {
  const data = await readSheetRows(buffer);

  // 빈 행을 건너뛰고 헤더 행 찾기
  let headerRowIndex = -1;
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length >= 3) { // 최소 3개 이상의 헤더가 있는 행
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('헤더 행을 찾을 수 없습니다. 최소 3개 이상의 열 제목이 필요합니다.');
  }

  const headerRow = data[headerRowIndex];
  const headers: { label: string; colIndex: number }[] = [];

  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      headers.push({ label: String(val).trim(), colIndex: c });
    }
  }

  if (headers.length === 0) {
    throw new Error('필드 헤더를 찾을 수 없습니다.');
  }

  // 데이터 행 (헤더 다음 행부터)
  const dataRows = data.slice(headerRowIndex + 1);

  // 중복 키 방지
  const usedKeys = new Set<string>();

  const fields: TemplateField[] = headers.map(({ label, colIndex }, i) => {
    // 데이터에서 타입 추론
    const columnValues = dataRows.map((row) => row[colIndex]);
    let type = inferTypeFromData(columnValues);

    // 데이터가 없으면 라벨에서 타입 추론
    const hasData = columnValues.some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasData) {
      const labelType = inferTypeFromLabel(label);
      if (labelType) type = labelType;
    }

    // select 옵션: 라벨에서 추출 또는 데이터에서 수집
    let options = extractOptionsFromLabel(label);
    if (!options && type === 'select') {
      const uniqueVals = new Set(
        columnValues
          .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
          .map(String)
      );
      if (uniqueVals.size > 0) options = Array.from(uniqueVals);
    }
    if (options) type = 'select';

    // 키 중복 방지
    let key = generateKey(label, i);
    if (usedKeys.has(key)) key = `${key}_${i}`;
    usedKeys.add(key);

    return { key, label, type, options, required: false };
  });

  // 프리뷰 (데이터가 있는 행만, 최대 5개)
  const preview = dataRows
    .filter(row => row && row.some(c => c !== null && c !== undefined && String(c).trim() !== ''))
    .slice(0, 5)
    .map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach(({ colIndex }, i) => {
        obj[fields[i].key] = row[colIndex];
      });
      return obj;
    });

  return { fields, preview };
}
