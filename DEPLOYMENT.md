# DEPLOYMENT.md — Production Guide

## 1) Environments and branch mapping

| Environment | Git branch(es)                        | Vercel environment | URL pattern                      | Notes                                                  |
| ----------- | ------------------------------------- | ------------------ | -------------------------------- | ------------------------------------------------------ |
| **dev**     | `dev` (default), local                | Development        | `dev.<project>.vercel.app`       | Fast iteration. Debug logging on. Tracing 100%.        |
| **preview** | Any PR branch except `main` and `dev` | Preview            | `<branch>--<project>.vercel.app` | Ephemeral. Staging data. Feature flags enabled for QA. |
| **prod**    | `main` (or `release/*` if used)       | Production         | `www.example.com`                | Strict budgets. SLOs enforced. Ads gated by flag.      |

Rules:

* PR to `main` auto-creates a **preview** deployment.
* Merge to `main` creates a **prod** deployment.
* Optional: `release/*` branches promote to **prod** only when manually approved.
* Hotfix: branch from `main`, PR with `hotfix/*`, merge to `main`.

Promotion and rollback:

* Promote an existing preview to prod from Vercel Dashboard (Promote) to avoid rebuilds.
* Revert code in Git only if a promote target is not available or contains the same defect.

---

## 2) Vercel configuration

### 2.1 Environment variables

Scopes:

* **Development** → local + `dev` deployments.
* **Preview** → all preview deployments.
* **Production** → `main` deployments.

Naming:

* Public keys: prefix with `NEXT_PUBLIC_` (served to client).
* Secrets: no public prefix. Rotate per policy below.

Minimum set (example; adjust to project):

| Key                           | Dev             | Preview           | Prod           | Notes                  |
| ----------------------------- | --------------- | ----------------- | -------------- | ---------------------- |
| `NEXT_PUBLIC_APP_ENV`         | `dev`           | `preview`         | `prod`         | Gate behavior per env. |
| `NEXT_PUBLIC_API_BASE_URL`    | Dev API         | Staging API       | Prod API       | Immutable per env.     |
| `SENTRY_DSN`                  | Optional        | Staging DSN       | Prod DSN       | Error tracking.        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Local collector | Staging collector | Prod collector | Traces/metrics.        |
| `DATABASE_URL`                | Dev DB          | Staging DB        | Prod DB        | No client exposure.    |
| `JWT_SIGNING_KEY`             | Dev key         | Staging key       | Prod key       | Rotate per policy.     |
| `RATE_LIMIT_REDIS_URL`        | Dev Redis       | Staging Redis     | Prod Redis     | For rate limiting.     |
| `AD_PROVIDER_KEY`             | Empty           | Staging           | Prod           | Gated by flag.         |

CLI:

```bash
# Pull envs locally for dev
vercel pull --environment=development
# List envs
vercel env ls
# Add or update
vercel env add NAME production
vercel env add NAME preview
vercel env add NAME development
```

### 2.2 Runtimes (Edge vs Node)

Use **Edge** for latency-bound, stateless, cache-friendly logic.
Use **Node** for heavy CPU, large dependencies, or Node-only APIs.

Next.js App Router per-route:

```ts
// app/api/hello/route.ts
export const runtime = 'edge'; // or 'nodejs'

export async function GET() {
  return new Response('ok');
}
```

Vercel function defaults and limits via `vercel.json`:

```json
{
  "functions": {
    "api/**.js": { "runtime": "nodejs20.x", "memory": 1024, "maxDuration": 10 },
    "app/**/route.js": { "runtime": "edge" }
  }
}
```

Constraints:

* No filesystem writes on Edge.
* No native Node modules on Edge.
* Keep Edge bundles small; avoid large SDKs.

### 2.3 Headers (security and cache)

`vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=()" }
      ]
    },
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": ".*--.*\\.vercel\\.app" }],
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive" }
      ]
    }
  ]
}
```

CSP:

* Start with `Content-Security-Policy-Report-Only` in **preview**.
* Enforce `Content-Security-Policy` in **prod** after verifying reports.
* Maintain allowlists for images, scripts, fonts, and ads if applicable.

### 2.4 Image optimization

`next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.example.com' },
      { protocol: 'https', hostname: 'cdn.example-ads.com' }
    ],
    minimumCacheTTL: 31536000
  }
};
module.exports = nextConfig;
```

Rules:

* Always serve hashed image URLs for immutable assets.
* Set `Cache-Control: public, max-age=31536000, immutable` on static images.
* Use AVIF/WebP first. Fallback to JPEG/PNG only when necessary.

### 2.5 Cache strategy

Static assets:

* Filename hashing.
* Long TTL + `immutable`.

Dynamic routes:

* ISR: `export const revalidate = <seconds>` per page/route.
* Requests: `fetch(url, { next: { revalidate: N } })` or `{ cache: 'no-store' }` for real-time.

API responses:

* Public-cacheable GETs: `Cache-Control: s-maxage=N, stale-while-revalidate=M`.
* Private data: `Cache-Control: no-store`.

Purging:

* Use Vercel "Purge Cache" by path after config changes or upstream content deletion.
* Redeploy to invalidate build-time artifacts.

Diagnostics:

* Inspect `x-vercel-cache: HIT|MISS|STALE|BYPASS` on responses.

---

## 3) Secrets rotation, incident rollback, log redaction

### 3.1 Secrets rotation

Cadence:

* **High-risk keys** (JWT, DB, payment, OAuth): 90 days.
* **Low-risk keys**: 180 days.
* **Emergency rotation**: immediate on leak or anomaly.

Method:

1. Issue **dual keys** at provider when possible.
2. Add new key to **dev** and **preview** envs. Deploy and verify.
3. Add to **prod** as secondary. Flip application to prefer new key via config/flag.
4. Remove old key after 24–72 hours of stable operation.
5. Document change: key owner, scope, expiry, links to test evidence.

Vercel:

* Store only in Vercel Env Vars with correct scope.
* Never commit secrets. Never expose via `NEXT_PUBLIC_`.

### 3.2 Incident rollback

Triggers:

* Error rate > SLO for 5 min.
* p95 latency regression > 30%.
* Security or data incident.

Actions (choose fastest safe path):

1. **Promote** last good preview deployment to prod from Dashboard.
2. **Toggle off** new features via server-side flag or Edge Config.
3. **Revert** the offending commit in `main` and redeploy.
4. **Freeze** deployments by protecting `main` until incident closed.

Post-incident:

* Root cause analysis within 48 hours.
* Add tests or guards to prevent recurrence.
* Schedule delayed re-release behind flag.

### 3.3 Log redaction policy

Never log:

* Full names with contact info, addresses, payment data, access tokens, session IDs, passwords, secrets, health data, raw request bodies containing PII.

Mask patterns:

* Emails → `u***@d***.tld`
* Phone → `***-***-1234`
* Tokens → prefix only (first 6), rest `*`
* IPs → /24 for IPv4, /48 for IPv6

Implementation:

* Central logger with **allowlist** fields for structured logs.
* Middleware to scrub headers: `authorization`, `cookie`, `set-cookie`, `x-api-key`.
* Error serialization drops request bodies. Include request IDs only.
* Retention: 14 days for **preview**, 30 days for **prod** unless legal hold.

---

## 4) Metrics and error tracking

### 4.1 Wiring

Error tracking (example Sentry):

```ts
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0),
  beforeSend(event) {
    // scrub breadcrumbs and extra fields if needed
    return event;
  }
});
```

OpenTelemetry (vendor-neutral):

* Export via OTLP HTTP to your collector.
* Propagate W3C trace context across Edge and Node.

Env vars:

```
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_RESOURCE_ATTRIBUTES=service.name=<app>,deployment.environment=<env>
```

Web analytics:

* Enable Vercel Web Analytics for all envs.
* Exclude staff traffic via IP and cookie filters where lawful.

### 4.2 Sampling guidance

| Signal                  |       dev | preview |                  prod |
| ----------------------- | --------: | ------: | --------------------: |
| **Errors**              |      100% |    100% |                  100% |
| **Transactions/Traces** |      100% |     25% |                 5–10% |
| **Profiles**            |       50% |     10% |                  1–5% |
| **Session replays**     | off or 5% |    2–5% | 0–2% with PII masking |

Rules:

* Burst to 100% tracing during incidents via flag.
* Always sample **all** errors. Downsample only duplicates at the sink.
* Mask DOM, inputs, and network payloads in session replay.

Alerts (prod):

* Error rate > 1% for 5 min → page.
* p95 API latency > SLO for 10 min → page.
* 5xx > 0.3% for 5 min → page.
* Synthetic check failure for 3 consecutive runs → page.

Dashboards:

* Core: traffic, error rate, latency p50/p95/p99, cache hit ratio, cold starts, DB saturation, queue depth.

---

## 5) Pre–go-live checklist

**Readiness**

* [ ] SLOs defined. Error budgets configured.
* [ ] Health checks pass. Synthetic probes green from 3 regions.
* [ ] Cold start within target for Edge and Node paths.

**Security**

* [ ] Secrets set for all scopes. Least privilege verified.
* [ ] CSP enforced in prod. Report-only validated in preview.
* [ ] HSTS, XCTO, XFO, Referrer-Policy, Permissions-Policy present.
* [ ] Admin routes behind auth and IP allowlist if applicable.

**Compliance and privacy**

* [ ] Privacy Policy page published and linked in footer.
* [ ] Terms of Service page published and linked in footer.
* [ ] Cookie banner configured per region law. Consent stored.
* [ ] Data processing agreements in place for vendors.

**Contact and legal**

* [ ] `support@yourdomain.com` or `/contact` page live and monitored.
* [ ] Security.txt published at `/.well-known/security.txt`.

**Traffic management**

* [ ] Rate limits configured and tested: per-IP, per-user, per-token.
* [ ] Abuse and bot rules enabled. Preview envs `noindex`.
* [ ] CDN cache rules validated. Purge paths documented.

**Ads and growth**

* [ ] Ads gated behind feature flag. Disabled by default in prod until legal review complete.
* [ ] Ad scripts and domains whitelisted in CSP only when enabled.

**Observability**

* [ ] Error tracking DSNs set for all envs.
* [ ] Tracing exporter reachable. Sampling set per table.
* [ ] Dashboards created. Alerts targeting on-call rotation.

**Release controls**

* [ ] Production branch protection on. Required checks passing.
* [ ] Promote workflow tested from preview to prod.
* [ ] Rollback runbook accessible.

**Content and SEO**

* [ ] Robots.txt and sitemap.xml correct per env.
* [ ] Metadata complete. Open Graph and Twitter cards validated.

---

## Appendices

### A) Example `vercel.json`

```json
{
  "version": 2,
  "functions": {
    "api/**.js": { "runtime": "nodejs20.x", "memory": 1024, "maxDuration": 10 },
    "app/**/route.js": { "runtime": "edge" }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=()" }
      ]
    },
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": ".*--.*\\.vercel\\.app" }],
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive" }
      ]
    }
  ],
  "redirects": [
    { "source": "/terms", "destination": "/legal/terms", "permanent": true },
    { "source": "/privacy", "destination": "/legal/privacy", "permanent": true }
  ]
}
```

### B) Example `next.config.js` (images and ISR)

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.example.com' }
    ],
    minimumCacheTTL: 31536000
  },
  experimental: {
    instrumentationHook: true
  }
};
module.exports = nextConfig;
```

### C) Example rate limit (Edge)

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = { matcher: ['/api/:path*'] };

export async function middleware(req: NextRequest) {
  // Implement token bucket via Redis or Upstash
  // Deny with 429 on exceed
  return NextResponse.next();
}
```

### D) Example feature flag for ads

```ts
export function adsEnabled(env = process.env.NEXT_PUBLIC_APP_ENV) {
  return env === 'prod' && process.env.ADS_FLAG === 'on';
}
```

### E) Runbooks (links to internal docs)

* **Secrets rotation**: `/docs/runbooks/secrets-rotation`
* **Incident rollback**: `/docs/runbooks/rollback`
* **Purge cache**: `/docs/runbooks/cache-purge`
* **On-call**: `/docs/runbooks/on-call`