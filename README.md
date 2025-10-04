# Research Agent Platform

A multi-agent AI platform that automates sales research through intelligent agents. Built for B2B sales teams to discover prospects, analyze companies, and gather competitive intelligence.

## Features

### Authentication & User Management
- Secure email/password authentication
- Credit-based usage tracking
- Multi-tenancy support (individual, reseller, client accounts)
- Row Level Security for data isolation

### Onboarding Agent
A conversational 5-step setup process that collects:
1. **Company Name** - Your organization
2. **Company URL** - Primary website for context
3. **Additional Sources** - LinkedIn, YouTube, and other data sources
4. **Competitors** - Track key competitors for comparative analysis
5. **Research Focus** - Customize what areas to prioritize:
   - Leadership & key contacts
   - Funding & financials
   - Technology stack
   - Recent news & announcements
   - Market positioning
   - Customer base
   - Hiring trends

### Research Agent (Chat Interface)
Intelligent research assistant that can:
- **Company Research** - Deep dives into target companies with personalized insights
- **Prospect Discovery** - Find and enrich qualified leads matching your ICP
- **Competitive Analysis** - Compare positioning against competitors
- **Market Intelligence** - Industry trends and growth opportunities

### Credit System
- Usage-based pricing model
- Real-time credit tracking
- Low balance warnings
- Transparent token usage display

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **Routing**: React Router v7
- **Icons**: Lucide React

## Database Schema

### Tables
- `users` - User accounts with credits and subscription info
- `company_profiles` - Company configuration from onboarding
- `chats` - Conversation threads
- `messages` - Individual chat messages with token tracking
- `research_outputs` - Completed research artifacts
- `usage_logs` - Audit trail for billing and analytics

### Security
- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- Resellers can view sub-account data
- Authentication required for all operations

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd research-agent-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# .env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run migrations:
The database schema is automatically set up via Supabase migrations.

5. Start the development server:
```bash
npm run dev
```

6. Build for production:
```bash
npm run build
```

## Usage Flow

### New User Journey

1. **Sign Up** (`/signup`)
   - Create account with email and password
   - Receive 100 free credits

2. **Onboarding** (`/onboarding`)
   - Complete 5-step company profile setup
   - Takes 2-3 minutes
   - Can edit later in Settings

3. **Dashboard** (`/`)
   - Chat with Research Agent
   - Create multiple research threads
   - View credit balance
   - Access previous conversations

4. **Research**
   - Ask natural language questions
   - Get structured, actionable insights
   - Export research outputs
   - Track token usage

### Research Examples

**Company Research:**
```
"Research Salesforce - focus on their leadership team and recent product launches"
```

**Prospect Discovery:**
```
"Find 20 B2B SaaS companies in the US with 50-200 employees.
Target VP of Sales or CRO. Focus on companies using HubSpot."
```

**Competitive Analysis:**
```
"Compare our positioning against HubSpot, Salesforce, and Zoho"
```

**Market Intelligence:**
```
"What are the latest trends in sales automation software?"
```

## Architecture

### Frontend Structure
```
src/
├── components/       # Reusable UI components
├── contexts/        # React contexts (Auth)
├── lib/            # Utilities and config (Supabase client)
├── pages/          # Route pages
│   ├── Login.tsx
│   ├── Signup.tsx
│   ├── Onboarding.tsx
│   ├── Dashboard.tsx
│   └── Settings.tsx
└── App.tsx         # Root component with routing
```

### Agent Architecture (Production Ready)

The platform is designed to integrate with real AI agents. The current implementation includes:

1. **Onboarding Agent** - Structured form-based flow (can be enhanced with conversational AI)
2. **Research Agent** - Mock responses (ready for integration with GPT-5 models)

### Production Agent Integration

To integrate real AI agents:

1. **Add Agent Framework** (e.g., LangChain, ag-ui, AutoGen)
```bash
npm install langchain @langchain/openai
```

2. **Implement Tool Layer**
   - Web scraping tools (Playwright, Cheerio)
   - API integrations (LinkedIn, Crunchbase, etc.)
   - Data enrichment services

3. **Update Agent Logic**
   - Replace mock responses in `Dashboard.tsx`
   - Implement streaming responses
   - Add tool calling capabilities

4. **Deploy Agent Infrastructure**
   - Use Supabase Edge Functions for serverless agents
   - Or deploy to separate backend service
   - Implement rate limiting and caching

## Current Limitations & Roadmap

### Current Implementation (MVP)
- ✅ Full authentication system
- ✅ Complete onboarding flow
- ✅ Chat interface with message history
- ✅ Credit tracking and usage logs
- ✅ Multi-chat management
- ✅ Settings and profile management
- ⚠️ Mock AI responses (not connected to real LLM)
- ⚠️ No actual web scraping tools

### Production Roadmap

**Phase 1: Core AI Integration**
- [ ] Integrate GPT-5 for agent responses
- [ ] Implement streaming responses
- [ ] Add basic web scraping tools
- [ ] Company data enrichment

**Phase 2: Advanced Research**
- [ ] LinkedIn scraping (with proper authentication)
- [ ] Prospect discovery with real data sources
- [ ] Competitive analysis tools
- [ ] Export to CSV/PDF

**Phase 3: Enterprise Features**
- [ ] CRM integrations (HubSpot, Salesforce)
- [ ] API access for developers
- [ ] Multi-tenancy for resellers
- [ ] Advanced analytics dashboard
- [ ] Webhook system

**Phase 4: Scale & Optimization**
- [ ] Caching layer (Redis)
- [ ] Proxy management for scraping
- [ ] Rate limiting per tier
- [ ] Background job processing
- [ ] Advanced security features

## Environment Variables

```env
# Required
VITE_SUPABASE_URL=          # Your Supabase project URL
VITE_SUPABASE_ANON_KEY=     # Your Supabase anonymous key

# Optional (for production)
OPENAI_API_KEY=             # For GPT integration
ANTHROPIC_API_KEY=          # For Claude integration
SCRAPING_PROXY_URL=         # Proxy service for web scraping
```

## Security Considerations

### Current Security Features
- Row Level Security on all database tables
- Authentication required for all protected routes
- Secure password hashing via Supabase Auth
- HTTPS enforced in production
- Environment variables for sensitive data

### Production Security Recommendations
- Enable 2FA for user accounts
- Implement rate limiting on API endpoints
- Add CAPTCHA for signup/login
- Set up monitoring and alerting
- Regular security audits
- Compliance with GDPR/CCPA

## License

Private - All Rights Reserved

## Support

For questions or support, contact your development team.
