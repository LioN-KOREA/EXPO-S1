// open-next.config.ts
// Used by `@opennextjs/aws` (OpenNext v3+) at build time.
//
// queue: silent-no-op custom override
// ------------------------------------
// OpenNext's queue component is invoked when a route is rendered while STALE
// (route-level ISR via `export const revalidate = N`). The built-in "dummy"
// queue throws on send — fine today (no route-level ISR exists in `src/`) but
// would break the SSR Lambda the moment someone adds one. We swap in a silent
// no-op so future ISR routes degrade to stale-served + lazy-refresh instead.
//
// What this does NOT disable:
// - `unstable_cache(..., { revalidate })` data-cache (uses incrementalCache:
//   S3 + DynamoDB via CACHE_BUCKET_* / CACHE_DYNAMO_TABLE env in infra/frontend.ts)
// - `revalidateTag()` / `revalidatePath()` — these go through tagCache
//   (DynamoDB, `opennext-tag-cache` table), not the queue
//
// Switch to the default ("sqs") and provision an SQS queue + revalidation
// Lambda in infra/frontend.ts when on-demand background route ISR is needed.

import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";

const config: OpenNextConfig = {
  default: {
    override: {
      queue: async () => ({
        name: "noop-queue",
        send: async () => {
          // Silent no-op. Route stays STALE until next request triggers a
          // synchronous refresh; matches the legacy `open-next` behavior we
          // ran on prior to the v3 migration.
        },
      }),
    },
  },
};

export default config;
