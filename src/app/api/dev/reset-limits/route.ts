import { NextRequest } from 'next/server';
import { RateLimiter } from '@/utils/rateLimiting';

export async function POST(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    RateLimiter.clearAllLimits();
    return new Response(JSON.stringify({ message: 'Rate limits cleared' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to clear rate limits' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
