/* Shared bits for the two Ask endpoints.
 *
 * The desktop app keeps the provider key in config.json and guards the routes
 * with a localhost check: the key is spendable, so only that machine's own app
 * may reach them. Online that guard is gone by definition - the whole point is
 * that other people can open the page - so the key moves to an environment
 * variable and the guard becomes a rate limit.
 *
 * AI_API_KEY (or GROQ_API_KEY) must be set in the Vercel project settings. It is never sent to
 * the browser, and there is no endpoint that echoes it back.
 */

/* Provider selection. Two env names for the key: AI_API_KEY is the generic one,
   GROQ_API_KEY the historical one - either works, so switching provider is a
   matter of AI_PROVIDER=anthropic + AI_MODEL=claude-sonnet-5 + the key. */
const { callModel: callShared, normalise } = require('./_model');

function config() {
  const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return normalise({
    apiKey,
    provider: process.env.AI_PROVIDER || 'groq',
    model: process.env.AI_MODEL,
    fallbackModel: process.env.AI_FALLBACK_MODEL,
    endpoint: process.env.AI_ENDPOINT,
    temperature: process.env.AI_TEMPERATURE,
    maxTokens: process.env.AI_MAX_TOKENS
  });
}

/* ── rate limit ──────────────────────────────────────────────────────
   In-memory and therefore per-instance: a warm function remembers, a cold
   one starts clean, and several instances do not share a count. That makes
   it a brake, not a gate - it stops one tab hammering the endpoint, it does
   not stop a determined crawler.

   It is here because the alternative is nothing at all. A shared counter
   needs a store (Upstash/Redis) and that is the thing to add if the bill
   ever moves. Saying so plainly beats a limiter that reads as airtight and
   is not. */
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.AI_RATE_PER_MIN || 12);

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function rateLimited(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) {
    HITS.set(ip, { start: now, n: 1 });
  } else if (rec.n >= MAX_PER_WINDOW) {
    const wait = Math.ceil((WINDOW_MS - (now - rec.start)) / 1000);
    res.setHeader('Retry-After', String(wait));
    fail(res, 429, 'Too many questions from this address. Try again in ' + wait + ' s.');
    return true;
  } else {
    rec.n++;
  }
  // keep the map from growing without bound on a long-lived instance
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) if (now - v.start > WINDOW_MS) HITS.delete(k);
  }
  return false;
}

function fail(res, status, message) {
  res.status(status || 502).json({ error: String(message || 'error').slice(0, 600) });
}

/* Read a JSON body. Vercel parses it for us when the content type is right,
   but a hand-rolled fetch may not set one - fall back to reading the stream so
   a missing header is not a mystery 500. */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > 1_000_000) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch (e) { return {}; }
}

const callModel = (cfg, messages, opts) => callShared(cfg, messages, opts);

module.exports = { config, callModel, fail, readBody, rateLimited };
