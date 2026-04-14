// Axon API Proxy — Vercel serverless function
// Sits between the browser and Anthropic, holds the API key server-side,
// enforces per-IP daily limit and a hard monthly request cap.

const DAILY_LIMIT_PER_IP = 3;       // max generations per IP per day
const MONTHLY_CAP = 500;            // hard stop — total requests this month across all users

// In-memory stores (reset on cold start, good enough for rate limiting)
// For persistence across instances, swap for Vercel KV (free tier available)
const ipLog = {};      // { "ip::YYYY-MM-DD": count }
const monthLog = {};   // { "YYYY-MM": count }

function getDate() {
  return new Date().toISOString().slice(0, 10); // "2026-04-14"
}

function getMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-04"
}

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

export default async function handler(req, res) {
  // CORS — allow requests from your own domain only in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const ip = getIP(req);
  const today = getDate();
  const month = getMonth();

  // Check monthly cap
  const monthCount = monthLog[month] || 0;
  if (monthCount >= MONTHLY_CAP) {
    return res.status(429).json({
      error: {
        message: `The demo has reached its monthly limit of ${MONTHLY_CAP} generations. If you want to keep using Axon, you can run it via your own Claude account at claude.ai.`
      }
    });
  }

  // Check daily per-IP limit
  const ipKey = ip + '::' + today;
  const ipCount = ipLog[ipKey] || 0;
  if (ipCount >= DAILY_LIMIT_PER_IP) {
    return res.status(429).json({
      error: {
        message: `You've used your ${DAILY_LIMIT_PER_IP} free generations for today. Come back tomorrow, or run Axon via your own Claude account at claude.ai.`
      }
    });
  }

  // Check API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'API key not configured on server.' }
    });
  }

  // Forward request to Anthropic
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  }

  // Enforce model and token cap server-side so client can't override
  body.model = 'claude-sonnet-4-20250514';
  body.max_tokens = Math.min(body.max_tokens || 8000, 8000);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }

    // Increment counters only on success
    ipLog[ipKey] = ipCount + 1;
    monthLog[month] = monthCount + 1;

    return res.status(200).json(data);

  } catch (err) {
    return res.status(502).json({
      error: { message: 'Upstream request failed: ' + err.message }
    });
  }
}
