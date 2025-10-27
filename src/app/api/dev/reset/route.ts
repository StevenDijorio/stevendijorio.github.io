import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ResetRecord = { bucket: string; status: 'reset' | 'skipped' | 'error'; cleared?: number };

function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function getDevResetters(): { name: string; reset: () => Promise<number | void> | number | void }[] {
  const reg = (globalThis as any).__DEV_RESETTERS__;
  if (!Array.isArray(reg)) return [];
  return reg
    .filter((r: any) => r && typeof r.name === 'string' && typeof r.reset === 'function')
    .map((r: any) => ({ name: r.name as string, reset: r.reset as () => Promise<number | void> | number | void }));
}

export async function POST(req: Request) {
  const env = process.env.NODE_ENV;

  if (env !== 'development') {
    return NextResponse.json(
      { ok: true, env, noop: true, reset: [] as ResetRecord[] },
      { status: 200 }
    );
  }

  const expected = process.env.X_DEV_KEY;
  const provided = req.headers.get('x-dev-key') || '';

  if (!expected || !constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const resetters = getDevResetters();
  const results: ResetRecord[] = [];

  for (const r of resetters) {
    try {
      const cleared = await r.reset();
      results.push({ bucket: r.name, status: 'reset', cleared: typeof cleared === 'number' ? cleared : undefined });
    } catch {
      results.push({ bucket: r.name, status: 'error' });
    }
  }

  return NextResponse.json({ ok: true, env, reset: results }, { status: 200 });
}
