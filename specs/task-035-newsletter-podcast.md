# Task 035: AI Automation Weekly — Newsletter + Podcast Pipeline

## Vision
Weekly newsletter via Beehiiv + podcast via ElevenLabs voice clone. Content sourced from X, Hacker News, AI research blogs. Builds audience for Pinchr and positions Drew as an AI thought leader.

## Current State
- Beehiiv API key exists at `workspace/.env.beehiiv`
- Episode 1 script drafted
- X/Twitter API keys at `workspace/.env.x-twitter`
- ElevenLabs available via `sag` skill
- No pipeline automation built yet

## Requirements

### Newsletter (Beehiiv)
1. Weekly research scan: X trending AI topics, HN top stories, AI blog RSS feeds
2. Curate top 5-7 items with brief analysis
3. Draft newsletter with sections: Top Stories, Tool of the Week, Pinchr Update, Quick Takes
4. Drew reviews draft before publish
5. Automated send via Beehiiv API

### Podcast (ElevenLabs)
1. Script generated from newsletter content (conversational tone)
2. Voice clone via ElevenLabs (Drew's voice or a professional voice)
3. Audio file generated and hosted
4. Embedded in newsletter and posted to podcast platforms

### Pipeline
1. Cron job: Monday morning — research + draft
2. Drew reviews Monday/Tuesday
3. Publish Wednesday
4. Podcast audio generated after newsletter approval

## Edge Cases
- Beehiiv API rate limits
- ElevenLabs voice quality on long-form content
- Content moderation — no hallucinated news stories
- RSS feeds go down → fallback to web search

## Definition of Done
- [ ] Automated weekly research scan produces draft
- [ ] Draft sent to Drew for review (Slack/WhatsApp)
- [ ] Approved draft published via Beehiiv API
- [ ] Podcast audio generated from script
- [ ] Full pipeline runs autonomously with human-in-the-loop approval

## Questions for Drew
- Voice preference for podcast: your voice clone or a professional voice?
- Podcast hosting platform preference?
- Newsletter name confirmed as "AI Automation Weekly"?
- Any specific AI blogs/sources to always include?
