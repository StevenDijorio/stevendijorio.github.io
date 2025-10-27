# RewriteGuard

Ad‑funded text rewrites with built‑in risk analysis and privacy by default. Goals: make high‑quality rewrites free via ads, quantify content risk before publish, keep users in control with data‑minimizing defaults.

---

## Architecture

```
+------------------------- Client (Web) -------------------------+
|  React/Vite UI  |  Auth UI  |  Offline Cache  |  Telemetry: Off|
+------------------------------|-------------------------------+-+
                               | HTTPS
                               v
+------------------------- Edge/API Gateway ---------------------+
|  Rate Limit |  AuthN/Z |  Privacy Proxy (PII scrub)           |
+------------------------------|---------------------------------+
                               | gRPC/REST
                               v
+--------------------------- Backend Core -----------------------+
|  Orchestrator  |  Jobs Queue  |  Credits Service  |  Audit Log |
+---------|----------------------|-------------------|------------+
          |                      |                   |
          v                      v                   v
+----------------+     +-------------------+     +----------------+
| Rewrite Engine |     | Risk Analyzer     |     | Ads Service    |
| (LLM adapter)  |<--->| PII/Toxicity/     |     | Provider SDKs  |
|                |     | Licensing checks  |     |                |
+----------------+     +-------------------+     +----------------+
          |                      |                   |
          v                      v                   v
+----------------+     +-------------------+     +----------------+
| Vector Store   |     | Postgres (Core)   |     | Redis (Cache)  |
+----------------+     +-------------------+     +----------------+

Dev URL: http://localhost:3000
```

### Module map

* `apps/web`: React UI, routing, upload, session.
* `apps/api`: REST and WebSocket endpoints, auth, rate limits.
* `services/rewrite`: LLM provider adapters, prompt templates.
* `services/risk`: PII, toxicity, license, hallucination heuristics, scores.
* `services/credits`: Ledger, ad credit minting, purchases, limits.
* `services/ads`: Ad network integrations, consent, frequency capping.
* `packages/db`: Prisma schemas and migrations for Postgres.
* `packages/queue`: BullMQ workers and schedulers.
* `packages/telemetry`: Opt‑in metrics, disabled by default.
* `infra`: Docker Compose, seed scripts, local stacks.

---

## Quick start

### Prerequisites

* Node.js 20+
* pnpm 9+ or npm 10+
* Docker 24+ (optional but recommended)
* Postgres 15+, Redis 7+

### Environment

```bash
cp .env.example .env
# edit .env
```

Key vars:

| Variable              | Example                  | Notes                     |                           |             |
| --------------------- | ------------------------ | ------------------------- | ------------------------- | ----------- |
| `PORT`                | `3000`                   | Web server port           |                           |             |
| `DATABASE_URL`        | `postgres://...`         | Postgres                  |                           |             |
| `REDIS_URL`           | `redis://localhost:6379` | Queue and cache           |                           |             |
| `LLM_PROVIDER`        | `openai                  | anthropic                 | azure`                    | Adapter key |
| `LLM_MODEL`           | `gpt-4o-mini`            | Any supported model       |                           |             |
| `LLM_API_KEY`         | `***`                    | Provider key              |                           |             |
| `PRIVACY_MODE`        | `strict`                 | `strict` by default       |                           |             |
| `AD_PROVIDER`         | `adsense                 | none`                     | Set `none` to disable ads |             |
| `AD_PROVIDER_KEY`     | `***`                    | If ads enabled            |                           |             |
| `CREDITS_START`       | `10`                     | New user starting credits |                           |             |
| `CREDITS_PER_REWRITE` | `1`                      | Cost per rewrite          |                           |             |

### Run with Docker

```bash
docker compose up --build
# open http://localhost:3000
```

### Run locally

```bash
pnpm install
pnpm db:migrate
pnpm dev
# or with npm:
# npm install
# npm run db:migrate
# npm run dev
```

### Common scripts

```bash
pnpm test
pnpm lint
pnpm format
pnpm queue:workers
```

---

## Usage

### Workflow

1. Sign in or continue as guest. Privacy mode is strict.
2. Create a project. Upload text or paste content.
3. Choose a rewrite goal: clarity, tone, length, SEO, academic.
4. Toggle risk checks. PII, toxicity, license, hallucination.
5. Click **Rewrite**. One rewrite consumes credits.
6. Review diff and the risk report. Accept or iterate.
7. Export as `.md` or `.docx`. Audit log stored locally by default.

### Screenshots

> Replace these placeholders with real images.

![Dashboard](docs/screenshots/01_dashboard.png)
![Rewrite Settings](docs/screenshots/02_rewrite_settings.png)
![Risk Report](docs/screenshots/03_risk_report.png)
![Diff View](docs/screenshots/04_diff_view.png)

### Credits

* You spend credits for rewrites and risk runs.
* Credits are minted by ad impressions if ads are enabled and consented.
* You can buy credits or invite teammates to earn bonus credits.
* Offline or no‑ads mode requires purchased credits only.
* Daily credit caps and rate limits prevent abuse.

---

## Configuration

### Privacy

* Telemetry is off by default. No session replay. No third‑party CDNs.
* The privacy proxy scrubs PII before provider calls if enabled.
* On‑device caching can be disabled. See `PRIVACY_MODE=strict`.

### Risk analysis

* Rules are modular. Scores: `safe`, `warn`, `block`.
* Exports include an embedded risk receipt for audits.
* Custom policies possible via `services/risk/policies`.

---

## Limitations

* Risk scores are heuristic. False positives and negatives occur.
* Third‑party LLMs may leak style or metadata. Use strict mode or self‑hosted models.
* Ad fill varies by region and consent. Free credits are not guaranteed.
* Long documents may require chunking. Formatting can shift on export.
* Non‑English support varies by model.

---

## Roadmap

* Bring‑your‑own model with local inference.
* Differential privacy for training‑free personalization.
* Team workspaces, roles, and shared credit pools.
* More risk detectors: factual grounding, citation validation.
* Plugin SDK for custom rewrites and checks.
* Mobile and offline desktop clients.
* Expanded ad providers with contextual controls.

---

## Contributing

* Use GitHub issues for bugs and proposals.
* Fork and branch from `main`. Branch naming: `feat/*`, `fix/*`, `chore/*`.
* Conventional Commits for messages: `type(scope): subject`.
* Add tests for changes. Keep coverage stable.
* Run `pnpm lint && pnpm format && pnpm test` before PR.
* Include a brief risk impact note in the PR description.
* Sign commits with DCO `Signed-off-by:` line.
* Do not add tracking or external SDKs without opt‑in and a privacy review.

---

## Development URLs

* App: `http://localhost:3000`
* API: `http://localhost:3000/api`
* Health: `http://localhost:3000/health`