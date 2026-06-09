import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../msw/server';

/**
 * Sanity 테스트 — 테스트 인프라(Vitest + jsdom + RTL + jest-dom + MSW) 가 정상 동작하는지 확인.
 * 실제 프로덕션 컴포넌트를 import 하지 않는다 (S0 슬라이스는 인프라만 다룸).
 */
describe('test infrastructure', () => {
  it('runs vitest with jsdom and renders DOM via RTL', () => {
    function Greeting({ name }: { name: string }) {
      return <h1>안녕하세요, {name}님</h1>;
    }

    render(<Greeting name="contEXT" />);

    expect(
      screen.getByRole('heading', { level: 1, name: '안녕하세요, contEXT님' })
    ).toBeInTheDocument();
  });

  it('supports jest-dom matchers', () => {
    function Banner() {
      return <div data-testid="banner">메시지 전송 예약</div>;
    }

    render(<Banner />);

    expect(screen.getByTestId('banner')).toHaveTextContent('메시지 전송 예약');
  });

  it('intercepts fetch through MSW handlers', async () => {
    server.use(
      http.get('https://example.test/api/ping', () =>
        HttpResponse.json({ ok: true, who: 'contEXT' }),
      ),
    );

    const res = await fetch('https://example.test/api/ping');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, who: 'contEXT' });
  });
});
