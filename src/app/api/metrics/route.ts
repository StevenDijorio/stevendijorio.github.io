import { z } from "zod";
// Next 16 may not expose unstable_after in all runtimes; use a local wrapper.
function after(task: () => Promise<void> | void) {
  setTimeout(() => {
    try {
      const p = task();
      if (p && typeof (p as any).then === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // swallow
    }
  }, 0);
}
import { ratelimit } from "@/lib/ratelimit";

type Json = Record<string, unknown>;

const TEXT_CONTENT_KEYS = new Set(
[
"text",
"content",
"html",
"markdown",
"body",
"message",
"prompt",
"output",
"input",
"title",
"description",
"comment",
"notes",
].map((k) => k.toLowerCase())
);

const PROPS_ALLOWLIST = new Set(
[
// navigation
"path",
"pathname",
"referrer",
"search",
"hash",
// environment
"locale",
"timezone",
"tz",
"country",
"region",
"city",
"device",
"os",
"browser",
"ua",
// viewport
"screen_width",
"screen_height",
"viewport_width",
"viewport_height",
// app metadata
"page_id",
"page_type",
"app_version",
"release",
"build",
"is_bot",
// metrics
"duration_ms",
"value",
"count",
"currency",
// experiments / campaigns
"experiment",
"variant",
"utm_source",
"utm_medium",
"utm_campaign",
"utm_term",
"utm_content",
].map((k) => k.toLowerCase())
);

const MetricSchema = z
.object({
event_name: z.string().min(1).max(128),
ts: z.coerce.number().finite().positive(),
session_id_hashed: z.string().min(16).max(256),
 props: z.record(z.string(), z.unknown()).default({}),
})
.strict();

type MetricInput = z.infer<typeof MetricSchema>;

function selfOrigin(url: string): string {
const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
return new URL(base && /^https?:/i.test(base) ? base : url).origin;
}

function isSameOrigin(req: Request): boolean {
const origin = req.headers.get("origin");
if (!origin) return true; // typical same-origin fetch
return origin === selfOrigin(req.url);
}

function jsonError(
code: string,
message: string,
status = 400,
extraHeaders?: HeadersInit
) {
return new Response(JSON.stringify({ error: code, message }), {
status,
headers: {
"content-type": "application/json; charset=utf-8",
"cache-control": "no-store",
"x-error-code": code,
...(extraHeaders ?? {}),
},
});
}

function sanitizeProps(raw: Record<string, unknown>): Record<string, unknown> {
const out: Record<string, unknown> = {};
for (const [k, v] of Object.entries(raw)) {
const key = k.toLowerCase();
if (TEXT_CONTENT_KEYS.has(key)) continue;
if (!PROPS_ALLOWLIST.has(key)) continue;

if (typeof v === "number" || typeof v === "boolean" || v === null) {
  out[key] = v;
  continue;
}

if (typeof v === "string") {
  // guard against free-form text
  const trimmed = v.trim();
  if (!trimmed) continue;
  if (trimmed.length > 160) continue;
  if (/[<>]|https?:\/\//i.test(trimmed)) continue;
  // keep small, label-like strings only
  out[key] = trimmed;
}
// drop arrays and objects

}
return out;
}

export async function POST(req: Request) {
if (!isSameOrigin(req)) {
return jsonError("forbidden_origin", "Origin not allowed", 403, {
Vary: "Origin",
"Cross-Origin-Resource-Policy": "same-origin",
Allow: "POST",
});
}

const ct = req.headers.get("content-type")?.toLowerCase() ?? "";
if (!ct.includes("application/json")) {
return jsonError("unsupported_content_type", "Expected application/json", 415, {
Allow: "POST",
});
}

let body: unknown;
try {
body = await req.json();
} catch {
return jsonError("invalid_json", "Malformed JSON body", 400, { Allow: "POST" });
}

const parsed = MetricSchema.safeParse(body);
if (!parsed.success) {
return jsonError("invalid_payload", "Validation failed", 422, { Allow: "POST" });
}

const data: MetricInput = parsed.data;

// per-session rate limit
try {
const { success, reset } = await ratelimit.limit(`metrics:${data.session_id_hashed}`);
if (!success) {
const retryAfter =
typeof reset === "number" ? String(Math.max(0, Math.ceil(reset - Date.now() / 1000))) : "60";
return jsonError("rate_limited", "Too many requests", 429, {
"Retry-After": retryAfter,
Allow: "POST",
});
}
} catch {
// if the util fails, fail closed
return jsonError("internal_error", "Rate limiter failure", 500, { Allow: "POST" });
}

// sanitize props
const safeProps = sanitizeProps((data.props ?? {}) as Json);

// normalize timestamp to ms
const tsMs = data.ts < 1e12 ? Math.round(data.ts * 1000) : Math.round(data.ts);

const safeEvent = {
event_name: data.event_name,
ts: tsMs,
session_id_hashed: data.session_id_hashed,
props: safeProps,
};

// fire-and-forget queue
after(async () => {
try {
  // Prefer an existing queue util if available at this path.
  // This import is optional and errors are swallowed to avoid blocking response.
  let mod: any = null;
  try { mod = await import("@/lib/metrics-queue"); } catch { mod = null; }
if (mod?.enqueueMetric && typeof mod.enqueueMetric === "function") {
await mod.enqueueMetric(safeEvent);
return;
}
// Fallback: try a generic ingestor if present.
  let alt: any = null;
  try { alt = await import("@/lib/metrics"); } catch { alt = null; }
if (alt?.ingestMetric && typeof alt.ingestMetric === "function") {
await alt.ingestMetric(safeEvent);
}
} catch {
// ignore
}
});

return new Response(null, {
status: 204,
headers: {
"cache-control": "no-store",
"Cross-Origin-Resource-Policy": "same-origin",
"Access-Control-Allow-Origin": selfOrigin(req.url),
Allow: "POST",
},
});
}

export async function GET() {
return jsonError("method_not_allowed", "Use POST", 405, { Allow: "POST" });
}

export async function OPTIONS() {
return jsonError("method_not_allowed", "Use POST", 405, { Allow: "POST" });
}

export async function PUT() {
return jsonError("method_not_allowed", "Use POST", 405, { Allow: "POST" });
}

export async function PATCH() {
return jsonError("method_not_allowed", "Use POST", 405, { Allow: "POST" });
}

export async function DELETE() {
return jsonError("method_not_allowed", "Use POST", 405, { Allow: "POST" });
}