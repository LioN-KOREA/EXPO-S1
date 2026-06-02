import { describe, expect, it } from 'vitest';
import {
  validateMessage,
  validateRecipientUserIds,
  validateScheduledAt,
  validateUuid,
} from '@/lib/scheduled-notice/validate';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('scheduled-notice validate', () => {
  describe('validateUuid', () => {
    it('정상 UUID', () => {
      expect(validateUuid(UUID)).toBe(true);
      expect(validateUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    });
    it('잘못된 형식 거부', () => {
      expect(validateUuid('not-a-uuid')).toBe(false);
      expect(validateUuid('11111111-1111-1111-1111-11111111111')).toBe(false);
      expect(validateUuid('')).toBe(false);
    });
  });

  describe('validateMessage', () => {
    it('정상', () => {
      expect(validateMessage('안녕')).toBeNull();
      expect(validateMessage('a'.repeat(4000))).toBeNull();
    });
    it('빈 본문/공백만 → message_empty', () => {
      expect(validateMessage('')).toBe('message_empty');
      expect(validateMessage('   ')).toBe('message_empty');
      expect(validateMessage('\n\t')).toBe('message_empty');
    });
    it('4001자 이상 → message_too_long', () => {
      expect(validateMessage('a'.repeat(4001))).toBe('message_too_long');
    });
  });

  describe('validateScheduledAt', () => {
    it('ISO 정상', () => {
      expect(validateScheduledAt('2026-06-03T01:00:00.000Z')).toBeNull();
    });
    it('잘못된 문자열 거부', () => {
      expect(validateScheduledAt('not-a-date')).toBe('scheduled_at_invalid');
      expect(validateScheduledAt('')).toBe('scheduled_at_invalid');
    });
  });

  describe('validateRecipientUserIds', () => {
    it('정상 UUID 배열', () => {
      expect(validateRecipientUserIds([UUID, UUID])).toBeNull();
    });
    it('빈 배열 거부', () => {
      expect(validateRecipientUserIds([])).toBe('recipient_empty');
    });
    it('non-array 거부', () => {
      expect(validateRecipientUserIds(null)).toBe('recipient_empty');
      expect(validateRecipientUserIds('uuid')).toBe('recipient_empty');
    });
    it('UUID 형식 아닌 element 거부', () => {
      expect(validateRecipientUserIds(['not-a-uuid'])).toBe('recipient_id_invalid');
      expect(validateRecipientUserIds([UUID, 'not-a-uuid'])).toBe('recipient_id_invalid');
    });
    it('비-문자열 element 거부', () => {
      expect(validateRecipientUserIds([UUID, 123])).toBe('recipient_id_invalid');
    });
  });
});
