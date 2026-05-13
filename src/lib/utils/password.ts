/**
 * 전화번호에서 국가코드·area code를 제거한 subscriber number를 초기 비밀번호로 사용.
 * 한국/외국 모두 일관 처리를 위해 "구분자로 split 후 마지막 두 그룹 합치기" 방식 채택.
 *
 * 예시:
 *  - '010-1234-5678'       → '12345678'    (한국 휴대폰 8자)
 *  - '02-345-6789'         → '3456789'     (서울 7자)
 *  - '031-123-4567'        → '1234567'     (지역 7자)
 *  - '(212) 555-1234'      → '5551234'     (미국 7자)
 *  - '+1 212-555-1234'     → '5551234'     (미국 국가코드 포함)
 *  - '+86 138 1234 5678'   → '12345678'    (중국 8자)
 *  - '+81 90-1234-5678'    → '12345678'    (일본 8자)
 *  - '01012345678' (구분자 없음) → '12345678' (마지막 8자 폴백)
 *
 * 결과가 6자 미만이거나 전화가 없으면 'excon00'(8자) fallback.
 * Supabase Auth 최소 6자 충족.
 */
export function getInitialPassword(phone: string | null | undefined): string {
  if (!phone) return 'excon00';

  // 구분자(공백·하이픈·점·괄호·슬래시 등)로 split
  const groups = phone.split(/[^\d]+/).filter(g => g.length > 0);

  // 마지막 두 그룹을 합쳐서 subscriber number 추출
  if (groups.length >= 2) {
    const lastTwo = groups.slice(-2).join('');
    if (lastTwo.length >= 6) return lastTwo;
  }

  // 폴백 1: 구분자 없는 입력 → 전체 숫자에서 마지막 8자
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  if (digits.length >= 6) return digits;

  // 폴백 2: 전화번호가 너무 짧음
  return 'excon00';
}

/**
 * @deprecated 4자리 비번은 Supabase Auth(최소 6자)에서 거부됨. getInitialPassword 사용.
 * 호환성 유지를 위해 같은 결과(전체 숫자)를 반환하도록 변경.
 */
export function getLast4Digits(phone: string): string {
  return getInitialPassword(phone);
}
