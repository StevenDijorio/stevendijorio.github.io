# Paper Rewriter

A free, ad-funded AI-powered writing style analysis and rewriting tool. This application helps users improve the naturalness and readability of their text while maintaining complete privacy.

## Features

### 🎯 Core Functionality
- **Real-time Risk Analysis**: Analyzes text for detectability patterns
- **AI-Powered Rewriting**: Improves writing style while preserving meaning
- **Ad-Gated Access**: Free service supported by rewarded video ads
- **PDF Export**: Generate analysis reports with before/after comparisons
- **Privacy-First**: No text storage, client-side analysis

### 📊 Risk Analysis
- Sentence length variation detection
- Trigram repetition analysis
- Function word entropy calculation
- Punctuation pattern analysis
- Overall detectability scoring

### 🛡️ Security & Abuse Prevention
- Rate limiting (5 rewrites per day)
- Boilerplate detection
- Suspicious activity monitoring
- Text validation and filtering

### 📱 User Experience
- Responsive design for all devices
- Real-time analysis updates
- Streaming rewrite responses
- Honor pledge system
- Free daily allowance

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Text Analysis**: Compromise.js
- **AI Models**: Gemini 2.5 Flash-Lite / Groq Llama-3.1 8B
- **PDF Generation**: pdf-lib
- **Deployment**: Vercel
- **Database**: Upstash Redis (optional)

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Git

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd paper-app

# Install dependencies
npm install

# Copy environment variables
cp env.example .env.local

# Start development server
npm run dev
```

### Environment Setup

Create `.env.local` with:

```bash
# AI Model (choose one)
GOOGLE_API_KEY=your_google_api_key
GROQ_API_KEY=your_groq_api_key
MODEL_PROVIDER=gemini

# Optional: Database
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Admin
ADMIN_PASSWORD=secure_password
```

## Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── rewrite/       # AI rewrite endpoint
│   │   ├── metrics/       # Analytics tracking
│   │   └── export-pdf/    # PDF generation
│   ├── admin/             # Admin dashboard
│   ├── privacy/           # Privacy policy
│   ├── terms/             # Terms of service
│   └── page.tsx           # Main editor
├── components/            # React components
│   └── RewardedGate.tsx   # Ad gate modal
├── store/                 # State management
│   └── useAppStore.ts     # Zustand store
└── utils/                 # Utility functions
    ├── riskAnalysis.ts    # Text analysis
    └── rateLimiting.ts    # Abuse prevention
```

## Usage

### For Users
1. **Enter Text**: Paste your text in the editor
2. **View Analysis**: See real-time risk analysis in the sidebar
3. **Rewrite**: Click "Rewrite" and watch an ad to continue
4. **Review**: Compare original and rewritten text
5. **Export**: Download PDF analysis report

### For Developers
1. **Analysis**: Text is analyzed client-side using Compromise.js
2. **Rewriting**: AI model processes text via streaming API
3. **Ads**: Rewarded video ads unlock additional rewrites
4. **Privacy**: No text is stored server-side

## API Endpoints

### POST `/api/rewrite`
Rewrites text using AI model with streaming response.

**Request:**
```json
{
  "text": "Your text here...",
  "targetBurstiness": 0.35
}
```

**Response:** Streaming text/plain

### POST `/api/metrics`
Tracks analytics events.

**Request:**
```json
{
  "event": "rewrite_ok",
  "timestamp": 1640995200000,
  "metadata": {}
}
```

### POST `/api/export-pdf`
Generates PDF analysis report.

**Request:**
```json
{
  "originalText": "...",
  "rewrittenText": "...",
  "originalScore": 65.2,
  "newScore": 85.1,
  "improvements": ["Improved sentence variation"]
}
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Set environment variables
4. Deploy

## Configuration

### AI Model Selection

**Gemini (Recommended):**
- Fast and cost-effective
- Good quality rewrites
- Easy setup with Google AI Studio

**Groq:**
- Very fast inference
- Good for high-volume usage
- Requires Groq Cloud account

### Ad Integration

The app includes mock ad integration. For production:

1. Set up Google AdSense or Ad Manager
2. Implement rewarded video ads
3. Update `RewardedGate.tsx` with actual SDK
4. Test ad flow thoroughly

## Monitoring

### Admin Dashboard
Access `/admin` to view:
- Daily metrics and revenue
- User activity patterns
- Cost analysis
- Performance indicators

### Key Metrics
- **Impressions**: Ad views
- **Rewards**: Successful ad completions
- **Rewrites**: Successful text processing
- **Revenue**: Ad earnings
- **Costs**: AI model usage costs

## Security Considerations

- **Rate Limiting**: 5 rewrites per 24 hours per IP
- **Abuse Detection**: Boilerplate and suspicious activity monitoring
- **Privacy**: No text storage, client-side analysis
- **Validation**: Input sanitization and length limits
- **Authentication**: Admin dashboard protection

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

This project is for educational and commercial use. Please ensure compliance with:
- AI model provider terms
- Ad network policies
- Privacy regulations (GDPR, CCPA)
- Academic integrity guidelines

## Support

For issues and questions:
1. Check the deployment guide
2. Review environment configuration
3. Test with sample text
4. Monitor error logs

## Roadmap

### Phase 1 (Current)
- ✅ Basic rewrite functionality
- ✅ Risk analysis
- ✅ Ad integration
- ✅ PDF export

### Phase 2 (Future)
- Genre-specific presets
- Plagiarism detection integration
- Advanced analytics
- User accounts (optional)
- Batch processing

### Phase 3 (Advanced)
- Multi-language support
- Custom model fine-tuning
- API for third-party integration
- White-label solutions

---

**Disclaimer**: This tool is designed as a writing style coach, not for bypassing academic integrity systems. Users are responsible for ethical use.