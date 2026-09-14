/* POST /api/ask — the grounded answer.
 *
 * The browser has already done the retrieval: it sends the clauses it found and
 * the question. This endpoint only adds the key and streams the model's reply
 * back. It never sees the rule books and never picks a clause, which is what
 * makes every sentence in the answer traceable to a passage the reader can open.
 */
const { config, callModel, fail, readBody, rateLimited } = require('./_groq');
const { SYSTEM_PROMPT } = require('./_prompts');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'POST only');
  const cfg = config();
  if (!cfg) return fail(res, 503, 'Ask is not configured on this deployment.');
  if (rateLimited(req, res)) return;

  let payload;
  try { payload = await readBody(req); }
  catch (e) { return fail(res, e.status || 400, e.message); }

  const passages = (payload.passages || []).slice(0, 24);
  const context = passages.map((p, i) =>
    `[${i + 1}] ${p.cite}${p.cut ? ' (TRUNCATED)' : ''}\n${String(p.text || '').slice(0, 4000)}`).join('\n\n');

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const h of (payload.history || []).slice(-4)) {
    if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      messages.push({ role: h.role, content: h.content.slice(0, 3000) });
  }
  messages.push({ role: 'user', content:
    `Question: ${String(payload.question || '').slice(0, 2000)}\n\n` +
    `Reply in the same language the question is written in. Keep every clause reference, symbol, ` +
    `unit and formula in its original English form regardless of the answer language.\n\n` +
    `Passages:\n\n${context}` });

  try {
    // 60 s, not the desktop's 90: a Hobby function is cut off at 60 anyway, and
    // a timeout the caller cannot see reads as a broken answer.
    const r = await callModel(cfg, messages, { stream: true, timeout: 58000 });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(ok => res.once('drain', ok));
    }
    res.end();
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) {} return; }
    fail(res, e.status, e.message || e);
  }
};
