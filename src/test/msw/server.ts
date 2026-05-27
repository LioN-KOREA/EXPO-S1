import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// 전역 msw 서버. 각 테스트에서 `server.use(...)` 로 케이스별 핸들러 등록.
// 기본 핸들러는 비어있고, 핸들링되지 않은 요청은 `onUnhandledRequest: 'error'` 정책에 의해 실패한다.
export const server = setupServer(...handlers);
