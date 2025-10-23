// Rate limiting utilities
// In production, use Redis or Vercel KV for persistent storage

interface RateLimitData {
  count: number;
  resetTime: number;
  lastRequest: number;
}

// In-memory storage for development
// In production, replace with Redis/Vercel KV
const rateLimitStore = new Map<string, RateLimitData>();

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(
    maxRequests: number = 5,
    windowMs: number = 24 * 60 * 60 * 1000, // 24 hours
    blockDurationMs: number = 60 * 60 * 1000 // 1 hour block
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.blockDurationMs = blockDurationMs;
  }

  async checkLimit(identifier: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const key = `rate_limit:${identifier}`;
    
    let data = rateLimitStore.get(key);
    
    // Clean up expired entries
    if (data && now > data.resetTime) {
      rateLimitStore.delete(key);
      data = undefined;
    }
    
    // Check if currently blocked
    if (data && now < data.lastRequest + this.blockDurationMs) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.lastRequest + this.blockDurationMs
      };
    }
    
    // Initialize or reset window
    if (!data || now > data.resetTime) {
      data = {
        count: 0,
        resetTime: now + this.windowMs,
        lastRequest: 0
      };
    }
    
    // Check if limit exceeded
    if (data.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.resetTime
      };
    }
    
    // Update counters
    data.count += 1;
    data.lastRequest = now;
    rateLimitStore.set(key, data);
    
    return {
      allowed: true,
      remaining: this.maxRequests - data.count,
      resetTime: data.resetTime
    };
  }

  async isBlocked(identifier: string): Promise<boolean> {
    const result = await this.checkLimit(identifier);
    return !result.allowed;
  }
}

// Abuse detection utilities
export class AbuseDetector {
  private static readonly BOILERPLATE_THRESHOLD = 0.8; // 80% similarity
  private static readonly MIN_LENGTH = 100; // Minimum text length
  private static readonly MAX_LENGTH = 1200; // Maximum text length

  static detectBoilerplate(text: string): boolean {
    if (text.length < this.MIN_LENGTH) return false;
    
    // Simple boilerplate detection based on repetition
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 3) return false;
    
    // Check for high repetition of sentence patterns
    const sentencePatterns = sentences.map(s => 
      s.trim().toLowerCase().replace(/\d+/g, 'NUMBER').replace(/[^\w\s]/g, '')
    );
    
    const uniquePatterns = new Set(sentencePatterns);
    const repetitionRatio = 1 - (uniquePatterns.size / sentencePatterns.length);
    
    return repetitionRatio > this.BOILERPLATE_THRESHOLD;
  }

  static validateText(text: string): { valid: boolean; reason?: string } {
    if (!text || text.trim().length === 0) {
      return { valid: false, reason: 'Text is empty' };
    }
    
    if (text.length < this.MIN_LENGTH) {
      return { valid: false, reason: `Text too short (minimum ${this.MIN_LENGTH} characters)` };
    }
    
    if (text.length > this.MAX_LENGTH) {
      return { valid: false, reason: `Text too long (maximum ${this.MAX_LENGTH} characters)` };
    }
    
    // Check for non-English content (basic heuristic)
    const englishRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (englishRatio < 0.7) {
      return { valid: false, reason: 'Text appears to be non-English' };
    }
    
    // Check for boilerplate
    if (this.detectBoilerplate(text)) {
      return { valid: false, reason: 'Text appears to be boilerplate or highly repetitive' };
    }
    
    return { valid: true };
  }
}

// Session management for tracking user behavior
export class SessionManager {
  static sessions = new Map<string, {
    startTime: number;
    requestCount: number;
    lastActivity: number;
    suspiciousActivity: boolean;
  }>();

  static createSession(identifier: string): void {
    this.sessions.set(identifier, {
      startTime: Date.now(),
      requestCount: 0,
      lastActivity: Date.now(),
      suspiciousActivity: false
    });
  }

  static updateSession(identifier: string): void {
    const session = this.sessions.get(identifier);
    if (session) {
      session.requestCount += 1;
      session.lastActivity = Date.now();
      
      // Detect suspicious activity (rapid requests)
      const timeSinceLastRequest = Date.now() - session.lastActivity;
      if (timeSinceLastRequest < 1000) { // Less than 1 second between requests
        session.suspiciousActivity = true;
      }
    }
  }

  static isSuspicious(identifier: string): boolean {
    const session = this.sessions.get(identifier);
    return session?.suspiciousActivity || false;
  }

  static cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.startTime > maxAge) {
        this.sessions.delete(key);
      }
    }
  }
}

// Initialize cleanup interval
setInterval(() => {
  SessionManager.cleanup();
}, 60 * 60 * 1000); // Clean up every hour
