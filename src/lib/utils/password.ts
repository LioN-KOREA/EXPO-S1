/**
 * 전화번호에서 뒤 4자리를 추출하여 초기 비밀번호로 사용
 */
export function getLast4Digits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-4) || '0000';
}
