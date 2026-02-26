# Task 038: Daily X/Twitter Content Engine

## Vision
Automated daily content pipeline for @pinchr_app and @Drew__Wagner. Scan AI news, draft tweets/threads, get Drew's approval, post. Build audience and establish thought leadership.

## Current State
- @pinchr_app developer account active, OAuth 1.0a keys working
- Credentials at `workspace/.env.x-twitter`
- Not posting yet — waiting for app testing to complete
- Story angle: "CEO and his AI built a product together"

## Requirements
1. **Daily scan**: X trending AI topics, HN front page, AI blog RSS feeds, Product Hunt launches
2. **Content types**:
   - Hot takes (1-2 tweets/day for @pinchr_app)
   - Threads (1/week — deep dives on AI automation topics)
   - Replies/engagement on relevant AI discussions
   - Personal posts for @Drew__Wagner (founder perspective)
3. **Approval workflow**: Draft → Drew reviews in Slack/WhatsApp → approved → posted
4. **Scheduling**: Queue posts for optimal times (peak engagement hours)
5. **Analytics**: Track impressions, engagement, follower growth

## Edge Cases
- X API rate limits (free tier is very restrictive)
- Content that could be controversial → always get approval
- Drew's personal account vs Pinchr brand account → different voice/tone
- Duplicate content detection — don't repeat themes too often

## Definition of Done
- [ ] Daily scan produces 2-3 draft tweets
- [ ] Drafts sent to Drew for approval
- [ ] Approved tweets posted via X API
- [ ] Weekly thread drafted and scheduled
- [ ] Basic analytics tracking

## Questions for Drew
- X API tier? Free has very limited posting (1500 tweets/month read, posting limits)
- Separate X developer app for @Drew__Wagner created? (task-059 is blocked on this)
- Tone guide for @pinchr_app vs @Drew__Wagner?
- Any topics/opinions to avoid?
