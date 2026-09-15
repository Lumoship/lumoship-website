/* POST /api/keywords — the English rule vocabulary behind a question.
 *
 * Without this a Turkish question finds nothing: the index holds English rule
 * text, and "kalinlik" does not overlap "thickness". The model is asked for the
 * words the RULE BOOK would use, not the words of the question - a bollard is
 * filed under mooring equipment, a manhole under closing appliances.
 */
const { config, callModel, fail, readBody, rateLimited } = require('./_groq');
const { KEYWORD_PROMPT } = require('./_prompts');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'POST only');
  const cfg = config();
  if (!cfg) return fail(res, 503, 'Ask is not configured on this deployment.');
  if (rateLimited(req, res)) return;

  let payload;
  try { payload = await readBody(req); }
  catch (e) { return fail(res, e.status || 400, e.message); }

  try {
    const r = await callModel(cfg, [
      { role: 'system', content: KEYWORD_PROMPT },
      { role: 'user', content:
        (payload.book ? 'The reader is searching ' + String(payload.book).slice(0, 80) + '. ' : '') +
        String(payload.question || '').slice(0, 800) }
    ], { stream: false, maxTokens: 700, temperature: 0, timeout: 25000, reasoningEffort: 'low' });

    const j = await r.json();
    const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
    const raw = String(msg.content || '');
    const terms = raw
      .replace(/^[^:\n]{0,40}:\s*/, '')
      .split(/[,;\n]+/)
      .map(s => s.replace(/["'`*•]|^\s*\d+[.)]\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
      .filter(s => s.length > 2 && s.length < 44 && /[a-z]/.test(s));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ terms: [...new Set(terms)].slice(0, 8) });
  } catch (e) { fail(res, e.status, e.message || e); }
};
