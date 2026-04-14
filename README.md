# Axon — Psychiatric Documentation Tool

AI-powered admission notes, discharge summaries, and referral letters for psychiatry.

## Deploy

1. Fork or clone this repo
2. Connect to [Vercel](https://vercel.com) (free)
3. Add environment variable: `ANTHROPIC_API_KEY` = your key from console.anthropic.com
4. Deploy — Vercel gives you a public URL instantly

## Rate limits (configurable in api/proxy.js)

- 3 generations per IP per day
- 500 total generations per month (hard cap)

## Stack

- Single HTML file frontend
- Vercel serverless function proxy
- Anthropic Claude Sonnet API
