import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // No-op since rate limiting is disabled; respond success for local tooling
  return new Response(JSON.stringify({ message: 'Rate limits cleared (noop)' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
