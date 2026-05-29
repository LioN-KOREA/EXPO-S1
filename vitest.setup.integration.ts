// 통합 테스트 setup — .env.development.local 자동 로드.
// 단위 트랙의 msw 라이프사이클은 의도적으로 제외 (실제 네트워크 호출 필요).
//
// dotenv 패키지를 신규 의존성으로 추가하지 않기 위해 수동 파서 사용.
// KEY=VALUE 형태 한 줄씩 + 따옴표/공백 트림.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.development.local');
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf-8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // 양 끝 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
