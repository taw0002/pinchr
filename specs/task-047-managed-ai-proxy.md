# Task 047: Managed AI Proxy — Zero-Friction Onboarding + Usage Revenue

## Vision
The #1 friction point for Pinchr is the API key setup. Kill it. Users sign up, get bundled AI credits, and start chatting immediately. No API keys, no provider accounts, no configuration. This is the revenue engine — margin on AI usage.

## Current State
- Onboarding requires API key from Anthropic/OpenAI/Google
- No proxy infrastructure exists
- Stripe is configured for subscriptions (Basic $20/yr, Pro $200/yr)
- Supabase backend exists for user management

## Requirements

### Proxy Server (Railway)
1. HTTPS endpoint that accepts OpenAI-compatible chat/completions requests
2. Routes to Anthropic Claude or OpenAI GPT based on user's model selection
3. Auth via Pinchr user token (JWT from Supabase)
4. Request logging for metering
5. Rate limiting per user tier

### Credit System (Supabase)
1. **Basic** ($20/yr): $10 AI credits included
2. **Pro** ($200/yr): $100 AI credits included
3. Track actual token costs per request (input/output/cached)
4. Real-time balance updates
5. Low-balance warnings (in-app notification at 20% remaining)
6. Credit purchase: Stripe checkout for top-ups ($5, $10, $25, $50)

### Pinchr App Integration
1. **Onboarding without API key**: Skip key step entirely, use managed proxy
2. **Usage dashboard**: Real-time credit balance, usage history, cost per session
3. **Model picker**: Choose between Opus/Sonnet/GPT (with cost indicators)
4. **Spend thresholds**: Set daily/monthly spending limits
5. **BYOK fallback**: Users can always add their own API key in Settings to bypass proxy

### Gateway Integration
1. Pinchr configures OpenClaw gateway to point at proxy URL
2. Proxy URL + auth token injected into gateway config automatically
3. Transparent to the agent — just works

## Edge Cases
- User runs out of credits mid-conversation → graceful error + purchase prompt
- Proxy server goes down → fallback to BYOK if configured
- Cost spikes from long Opus conversations → spend threshold protection
- Free trial users → 7 days of credits, then paywall
- Concurrent requests from same user → queue or parallel with rate limit

## Definition of Done
- [ ] Proxy server deployed on Railway, routing to Anthropic + OpenAI
- [ ] Credit system in Supabase with real-time balance tracking
- [ ] Stripe integration for credit purchases
- [ ] Pinchr onboarding works without API key
- [ ] Usage dashboard shows balance + history
- [ ] Spend thresholds configurable
- [ ] BYOK option in Settings as alternative
- [ ] Gateway auto-configured to use proxy

## Technical Notes
- Proxy: Node.js/Express on Railway, OpenAI-compatible endpoint
- Auth: Verify Supabase JWT, extract user_id for metering
- Metering: Log each request with token counts from provider response
- Cost calculation: Use provider pricing tables (cached, updated daily)
- Stripe: Use Payment Intents for credit purchases, webhooks for confirmation

## Revenue Math
- If Basic user uses $8 of $10 credits → 80% COGS, 20% margin
- If Pro user uses $60 of $100 credits → 60% COGS, 40% margin
- Credit top-ups are pure margin above included amount
- Goal: Credits cover most users, heavy users buy top-ups

## Questions for Drew
- Anthropic volume pricing status? (task-060)
- Railway vs Fly.io vs Cloudflare Workers for proxy hosting?
- Minimum credit purchase amount?
- Should free trial get credits or just BYOK?
