require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // optional, only needed if frontend is hosted elsewhere

app.use(express.json({ limit: '15mb' }));

if (ALLOWED_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// --- Simple in-memory per-IP rate limit (image generation costs real money per call) ---
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 12);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000); // 1 hour
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (hits.get(ip) || []).filter(t => t > windowStart);
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

app.post('/api/preview', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY. Set it in server/.env and restart.' });
    }
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ error: 'Too many preview requests from this device. Please try again later.' });
    }

    const { photo, styleName, styleDescription, colorName } = req.body || {};
    if (!photo || typeof photo !== 'string' || !photo.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Missing or invalid photo.' });
    }
    if (!styleName || typeof styleName !== 'string') {
      return res.status(400).json({ error: 'Missing styleName.' });
    }

    const base64 = photo.split(',').pop();
    const imageBuffer = Buffer.from(base64, 'base64');
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Photo is too large (max 10MB).' });
    }

    let prompt = `Edit this portrait photo so the person is wearing this hairstyle: ${styleName}.`;
    if (styleDescription) prompt += ` Style notes: ${styleDescription}`;
    if (colorName) prompt += ` Also change the hair colour to ${colorName}.`;
    prompt += ' Keep the same face, identity, skin tone, facial expression, and background unchanged. Photorealistic, natural lighting, high quality, no text or watermark.';

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('image', new Blob([imageBuffer], { type: 'image/png' }), 'photo.png');

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(502).json({ error: data.error?.message || 'Image generation failed upstream.' });
    }

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'No image returned by the generation provider.' });

    res.json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error while generating the preview.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(OPENAI_API_KEY) });
});

// Serve the static site (index.html, hairstyle-app.html) from the repo root
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`StyleBook server running on http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) console.warn('Warning: OPENAI_API_KEY is not set — AI preview requests will fail until it is configured.');
});
