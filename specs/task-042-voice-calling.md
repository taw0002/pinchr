# Task 042: Voice Calling via Twilio + OpenAI Realtime

## Vision
Call the AI agent on the phone and have a real-time voice conversation. Uses Twilio → WebSocket relay → OpenAI Realtime API with agent system prompt and project context.

## Current State
- Twilio number provisioned (configure via environment variables)
- Number is active but webhooks not configured
- OpenAI Realtime API available

## Requirements
1. **Media stream server**: WebSocket relay for Twilio ↔ OpenAI Realtime
2. **Agent system prompt**: Include personality, current context, project status
3. **Deploy to Railway**: WebSocket server accessible from Twilio
4. **Twilio webhooks**: Point voice webhook to deployed server
5. **Context injection**: Before each call, pull recent memory + active tasks as context
6. **Call transcription**: Log call transcripts to memory files
7. **Action execution**: Agent can take actions during calls (create tasks, send messages, check status)

## Environment Variables Required
- `TWILIO_ACCOUNT_SID` — Your Twilio account SID
- `TWILIO_AUTH_TOKEN` — Your Twilio auth token
- `TWILIO_PHONE_NUMBER` — Your Twilio phone number
- `OPENAI_API_KEY` — For Realtime API access

## Edge Cases
- Long calls → context window management for Realtime API
- Network interruption → graceful reconnection or callback
- Multiple simultaneous calls → queue or reject
- Sensitive information over phone → privacy considerations
- Cost management → OpenAI Realtime API pricing

## Definition of Done
- [ ] Media stream server deployed on Railway
- [ ] Twilio webhook configured
- [ ] Can call the number and talk to the agent
- [ ] Agent has personality + project context
- [ ] Call transcripts logged to memory
- [ ] Basic action execution during calls (create task, check status)

## Technical Notes
- OpenAI Realtime API uses WebSocket with audio streaming
- Twilio sends media via WebSocket in mulaw format
- Railway provides persistent WebSocket support
- System prompt should be dynamically built from context files
