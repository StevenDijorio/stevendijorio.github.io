# Paper Rewriter - Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Domain**: Purchase a domain from your preferred registrar
3. **AI Model Access**: Choose one of the following:
   - Google AI Studio (Gemini 2.5 Flash-Lite)
   - Groq Cloud (Llama-3.1 8B)
4. **Ad Network**: Set up Google AdSense or Ad Manager account
5. **Database** (optional): Upstash Redis for production rate limiting

## Step 1: Deploy to Vercel

1. **Connect Repository**:
   ```bash
   # Push your code to GitHub/GitLab
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy via Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your repository
   - Configure build settings (Next.js auto-detected)
   - Deploy

## Step 2: Environment Configuration

In Vercel dashboard, go to your project → Settings → Environment Variables:

```bash
# Required
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
MODEL_PROVIDER=gemini

# Optional (for production)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
ADMIN_PASSWORD=secure_password_here
```

## Step 3: AI Model Setup

### Option A: Google Gemini (Recommended)
1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create API key
3. Add to Vercel environment variables
4. Set `MODEL_PROVIDER=gemini`

### Option B: Groq Cloud
1. Sign up at [console.groq.com](https://console.groq.com)
2. Generate API key
3. Add to Vercel environment variables
4. Set `MODEL_PROVIDER=groq`

## Step 4: Ad Network Integration

### Google AdSense Setup
1. Apply for AdSense at [adsense.google.com](https://adsense.google.com)
2. Get approved (may take 24-48 hours)
3. Add ad code to your site
4. Update `RewardedGate.tsx` with actual ad implementation

### Ad Manager Setup (Alternative)
1. Create Google Ad Manager account
2. Set up rewarded video ads
3. Implement SDK in your app

## Step 5: Custom Domain

1. **In Vercel**:
   - Go to project → Settings → Domains
   - Add your custom domain
   - Follow DNS instructions

2. **In Your Domain Registrar**:
   - Add CNAME record: `www` → `cname.vercel-dns.com`
   - Add A record: `@` → `76.76.19.61`

3. **Verify Domain**:
   - Wait for DNS propagation (up to 24 hours)
   - Test your domain in browser

## Step 6: Production Configuration

### Update AI Model Integration
Replace the mock implementation in `/src/app/api/rewrite/route.ts`:

```typescript
// For Gemini
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  })
});

// For Groq
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7,
    max_tokens: 2048,
    stream: true
  })
});
```

### Update Ad Integration
Replace mock implementation in `RewardedGate.tsx` with actual ad SDK.

### Set Up Analytics
1. Add Google Analytics or similar
2. Update metrics collection in `/src/app/api/metrics/route.ts`
3. Set up monitoring and alerts

## Step 7: Testing

### Pre-Launch Checklist
- [ ] Domain is working
- [ ] AI model integration is functional
- [ ] Ad system is working
- [ ] Rate limiting is active
- [ ] Privacy/terms pages are accessible
- [ ] Admin dashboard is secured
- [ ] PDF export is working
- [ ] Mobile responsiveness

### Test Scenarios
1. **Basic Flow**: Enter text → Analyze → Rewrite → Export
2. **Rate Limiting**: Test with multiple requests
3. **Ad Flow**: Test ad gate functionality
4. **Error Handling**: Test with invalid inputs
5. **Mobile**: Test on various devices

## Step 8: Launch

1. **Final Deployment**:
   ```bash
   git add .
   git commit -m "Production ready"
   git push origin main
   ```

2. **Monitor**:
   - Check Vercel dashboard for errors
   - Monitor analytics
   - Watch for rate limit violations
   - Track ad performance

3. **Go Live**:
   - Share your domain
   - Monitor user feedback
   - Track metrics in admin dashboard

## Maintenance

### Regular Tasks
- Monitor daily metrics in `/admin`
- Check for rate limit abuse
- Update AI model prompts as needed
- Monitor ad revenue and costs
- Update dependencies regularly

### Scaling Considerations
- Implement Redis for production rate limiting
- Add CDN for static assets
- Consider database for user sessions
- Monitor API costs and usage

## Troubleshooting

### Common Issues
1. **AI Model Errors**: Check API keys and quotas
2. **Ad Not Loading**: Verify domain approval
3. **Rate Limiting**: Check Redis connection
4. **PDF Export**: Verify pdf-lib installation

### Support Resources
- Vercel Documentation
- Next.js Documentation
- AI Model Provider Docs
- Ad Network Support

## Security Notes

- Never commit API keys to git
- Use environment variables for all secrets
- Implement proper rate limiting
- Monitor for abuse patterns
- Keep dependencies updated
- Use HTTPS only

## Cost Estimation

### Monthly Costs (Estimated)
- Vercel Pro: $20/month
- AI Model API: $50-200/month (depends on usage)
- Domain: $10-15/year
- Redis (optional): $10-20/month
- **Total**: ~$80-250/month

### Revenue Potential
- Ad revenue: $1-5 per 1000 impressions
- Target: 10,000+ daily users for profitability
- Monitor eCPM and adjust pricing

---

**Note**: This is a development version. For production, implement proper error handling, monitoring, and security measures.
