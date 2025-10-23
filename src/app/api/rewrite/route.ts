import { NextRequest } from 'next/server';
import { z } from 'zod';
import { RateLimiter, AbuseDetector, SessionManager } from '@/utils/rateLimiting';

const bodySchema = z.object({
  text: z.string().min(50).max(8000),
  targetBurstiness: z.number().min(0.25).max(0.5).default(0.35)
});

// Mock AI model call - replace with actual model integration
async function callModel(system: string, user: string): Promise<string> {
  // This is a placeholder - replace with actual model API calls
  // For Gemini 2.5 Flash-Lite:
  // const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
  //     generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  //   })
  // });
  
  // For Groq Llama-3.1 8B:
  // const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     model: 'llama-3.1-8b-instant',
  //     messages: [
  //       { role: 'system', content: system },
  //       { role: 'user', content: user }
  //     ],
  //     temperature: 0.7,
  //     max_tokens: 2048,
  //     stream: true
  //   })
  // });
  
  // Mock response for development
  const mockRewrite = user.split('\n')[0].replace('Text:\n', '');
  return `This is a rewritten version of your text. The original content has been rephrased to improve naturalness and readability while maintaining the same meaning and structure. Here's the rewritten version:\n\n${mockRewrite}\n\n[This is a mock response - replace with actual AI model integration]`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, targetBurstiness } = bodySchema.parse(body);

    // Get client identifier for rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown';
    
    // Initialize session if needed
    if (!SessionManager.sessions.has(clientIP)) {
      SessionManager.createSession(clientIP);
    }
    SessionManager.updateSession(clientIP);
    
    // Check for abuse
    const abuseCheck = AbuseDetector.validateText(text);
    if (!abuseCheck.valid) {
      return new Response(JSON.stringify({ 
        error: 'Text validation failed', 
        reason: abuseCheck.reason 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check rate limits
    const rateLimiter = new RateLimiter(5, 24 * 60 * 60 * 1000); // 5 requests per 24 hours
    const rateLimitResult = await rateLimiter.checkLimit(clientIP);
    
    if (!rateLimitResult.allowed) {
      const resetTime = new Date(rateLimitResult.resetTime).toISOString();
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded', 
        resetTime,
        remaining: rateLimitResult.remaining
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check for suspicious activity
    if (SessionManager.isSuspicious(clientIP)) {
      return new Response(JSON.stringify({ 
        error: 'Suspicious activity detected' 
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const system = `You are a writing style coach. Rewrite the provided text to preserve meaning, facts, and citations while improving naturalness and readability. Vary sentence length and rhythm. Use contractions where natural. Avoid adding new claims. Keep the same paragraph count and overall structure.`;

    const user = `Text:\n${text}\n\nTargets:\nBurstiness=${targetBurstiness}\n\nRules:\n1) Keep all names, numbers, and citations exactly as they are\n2) Do not shorten the text by more than 5%\n3) Maintain the same tone and point of view\n4) Focus on varying sentence structure and word choice\n5) Make the writing sound more natural and human-like`;

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await callModel(system, user);
          
          // Stream the result in chunks
          const chunks = result.split(' ');
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
            controller.enqueue(encoder.encode(chunk));
            
            // Add a small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Rewrite API error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid request data' }), {
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
