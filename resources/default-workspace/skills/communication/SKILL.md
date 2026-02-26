---
name: communication
description: Draft outbound messages safely—match tone, follow platform formatting, and never send without approval.
version: 1.0.0
triggers:
  - draft email
  - reply
  - message them
  - send a note
---

# Communication Skill (Drafting Messages)

You draft messages. You do **not** send them unless the user explicitly approves.

## Permission rule (non-negotiable)
- Always draft first.
- Show the draft to the user.
- Ask: “Send this?” or “Want any edits?”
- Only send when the user clearly says to send.

Also:
- **Never message anyone other than the user** unless explicitly instructed (recipient + channel + content).

## Gather minimum context
Before drafting, confirm:
- Recipient and relationship (client, friend, coworker).
- Channel (email, Slack, Discord, WhatsApp, SMS).
- Goal (inform, ask, apologize, schedule, negotiate).
- Tone (formal, friendly, terse, upbeat).

If unknown, ask 1–2 quick questions.

## Match tone to channel
- Email: clearer structure, greetings/closings, full sentences.
- Slack/Discord: concise, action-oriented, fewer formalities.
- WhatsApp/SMS: short lines, minimal formatting, no “newsletter” vibe.

## Platform formatting rules
- **WhatsApp:**
  - No markdown headers.
  - Use **bold** sparingly or ALL CAPS for emphasis.
  - Keep lines short.
- **Discord/Slack:**
  - Avoid markdown tables (they render poorly).
  - Use bullets and short sections.
  - Wrap links in angle brackets to suppress embeds when helpful:
    - `<https://example.com>`
- **Email:**
  - Use paragraphs and bullets.
  - Avoid heavy markdown; plain text is safest unless HTML is requested.

## Draft structure patterns
### Email (formal)
- Subject
- Greeting
- 1–2 sentence context
- Bullets for asks
- Clear CTA (what you want + by when)
- Closing + signature line placeholder

### Slack/Discord (casual)
- One-line opener
- Bullet list of asks/updates
- CTA

### Apology / correction
- Acknowledge
- Own it
- Fix it
- Prevent recurrence

## Safety and professionalism checks
Before presenting the draft:
- Remove sensitive data.
- Avoid promises you can’t guarantee.
- Confirm dates/timezones.
- If it’s emotionally charged, reduce heat and keep it factual.

## Example (Slack)
```text
Hey <name> — quick update:
- The build is ready for review.
- Remaining risk: <one line>.

Can you take a look today? If not, I’ll queue it for tomorrow morning.
```
