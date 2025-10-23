import { NextRequest } from 'next/server';
import { z } from 'zod';

const metricsSchema = z.object({
  event: z.enum(['ad_shown', 'ad_rewarded', 'rewrite_start', 'rewrite_ok', 'rewrite_fail']),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.any()).optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, timestamp, metadata } = metricsSchema.parse(body);
    
    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown';
    
    // In a real implementation, you would:
    // 1. Store metrics in a database (e.g., Vercel KV, Upstash Redis)
    // 2. Implement rate limiting per IP
    // 3. Aggregate daily totals
    // 4. Calculate revenue and costs
    
    console.log('Metrics event:', { event, timestamp, metadata, clientIP });
    
    // Mock storage - replace with actual database
    const mockStorage = {
      dailyTotals: {
        [new Date().toISOString().split('T')[0]]: {
          impressions: 0,
          rewards: 0,
          rewrites: 0,
          failures: 0
        }
      }
    };
    
    // Update metrics based on event
    const today = new Date().toISOString().split('T')[0];
    if (!mockStorage.dailyTotals[today]) {
      mockStorage.dailyTotals[today] = { impressions: 0, rewards: 0, rewrites: 0, failures: 0 };
    }
    
    switch (event) {
      case 'ad_shown':
        mockStorage.dailyTotals[today].impressions++;
        break;
      case 'ad_rewarded':
        mockStorage.dailyTotals[today].rewards++;
        break;
      case 'rewrite_start':
        // Track rewrite attempts
        break;
      case 'rewrite_ok':
        mockStorage.dailyTotals[today].rewrites++;
        break;
      case 'rewrite_fail':
        mockStorage.dailyTotals[today].failures++;
        break;
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Metrics API error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid metrics data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
