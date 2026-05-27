import type { RequestHandler } from 'msw';

// 기본 핸들러는 비어있다.
// 테스트 케이스에서 `server.use(http.get('/api/...', () => HttpResponse.json(...)))` 형태로 등록한다.
export const handlers: RequestHandler[] = [];
