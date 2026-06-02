import { describe, expect, it } from 'vitest';
import {
  getScheduledNoticeErrorMessage,
  mapRpcError,
  ScheduledNoticeError,
  SCHEDULED_NOTICE_ERROR_CODES,
} from '@/lib/scheduled-notice/errors';

describe('scheduled-notice errors', () => {
  describe('mapRpcError', () => {
    it('각 알려진 키워드를 코드로 매핑', () => {
      for (const code of SCHEDULED_NOTICE_ERROR_CODES) {
        if (code === 'unknown') continue;
        const err = mapRpcError(code);
        expect(err).toBeInstanceOf(ScheduledNoticeError);
        expect(err.code).toBe(code);
      }
    });

    it('포스트그레스 prefix 가 있어도 키워드 추출', () => {
      const err = mapRpcError('ERROR: not_admin (SQLSTATE 42501)');
      expect(err.code).toBe('not_admin');
    });

    it('미지 메시지는 unknown', () => {
      const err = mapRpcError('something totally different');
      expect(err.code).toBe('unknown');
    });

    it('null/undefined → unknown', () => {
      expect(mapRpcError(undefined).code).toBe('unknown');
      expect(mapRpcError(null).code).toBe('unknown');
    });

    it('단어 경계 매칭 — substring false positive 차단', () => {
      // 'not_administered' 같은 가상의 다른 에러가 not_admin 으로 잘못 매핑되면 안 됨
      expect(mapRpcError('not_administered_action').code).toBe('unknown');
      expect(mapRpcError('xpast_schedule').code).toBe('unknown');
      expect(mapRpcError('past_schedulez').code).toBe('unknown');
    });
  });

  describe('getScheduledNoticeErrorMessage', () => {
    it('ko 매핑 — 모든 코드가 비어있지 않음', () => {
      for (const code of SCHEDULED_NOTICE_ERROR_CODES) {
        expect(getScheduledNoticeErrorMessage(code, 'ko').length).toBeGreaterThan(0);
      }
    });

    it('en 매핑 — 모든 코드가 비어있지 않음', () => {
      for (const code of SCHEDULED_NOTICE_ERROR_CODES) {
        expect(getScheduledNoticeErrorMessage(code, 'en').length).toBeGreaterThan(0);
      }
    });

    it('대표 코드 메시지 검증 (ko)', () => {
      expect(getScheduledNoticeErrorMessage('past_schedule', 'ko')).toContain('과거');
      expect(getScheduledNoticeErrorMessage('not_admin', 'ko')).toContain('관리자');
    });

    it('대표 코드 메시지 검증 (en)', () => {
      expect(getScheduledNoticeErrorMessage('past_schedule', 'en').toLowerCase()).toContain('past');
      expect(getScheduledNoticeErrorMessage('not_admin', 'en').toLowerCase()).toContain('admin');
    });

    it('기본 locale 은 ko', () => {
      expect(getScheduledNoticeErrorMessage('event_ended')).toBe(
        getScheduledNoticeErrorMessage('event_ended', 'ko')
      );
    });
  });
});
