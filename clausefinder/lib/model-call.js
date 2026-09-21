/* One model call, two providers, one shape.
 *
 * Both servers (server.js on the desktop, api/*.js on Vercel - sync.py copies
 * this file there as api/_model.js) call callModel() and get back the same
 * thing whatever sits behind it: a Response-like object whose stream is
 * OpenAI-style SSE ("data: {choices:[{delta:{content}}]}" ... "data: [DONE]")
 * and whose json() is {choices:[{message:{content}}]}. The browser parser and
 * the keyword endpoint therefore never learn which provider answered.
 *
 *   provider 'openai'     any /chat/completions endpoint: Groq, OpenRouter,
 *                         Mistral, a local server... Bearer key, passed through.
 *   provider 'anthropic'  Claude, via the native Messages API (not the OpenAI
 *                         compatibility layer, which is beta and drops fields).
 *                         Its SSE is translated here so nothing else changes.
 *
 * Fallback: a model can be retired or rate-limited overnight; a 404/429/529 on
 * the primary tries the spare once, and the caller sees one answer either way.
 * Reasoning effort is a Groq-side knob (reasoning models spend the budget
 * thinking); Claude ignores it, no thinking is requested there.
 */
'use strict';

const ENDPOINTS = {
  openai: 'https://api.groq.com/openai/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages'
};
const DEFAULT_MODELS = {
  openai: { model: 'openai/gpt-oss-120b', fallbackModel: 'llama-3.3-70b-versatile' },
  anthropic: { model: 'claude-sonnet-5', fallbackModel: 'claude-haiku-4-5-20251001' }
};

/* Normalise whatever the caller read from env / config.json. */
function normalise(cfg) {
  // kind drives the wire format; provider is the name shown in the panel ("groq")
  const kind = (cfg.provider === 'anthropic' || cfg.provider === 'claude') ? 'anthropic' : 'openai';
  const d = DEFAULT_MODELS[kind];
  return {
    kind,
    provider: kind === 'anthropic' ? 'anthropic' : (cfg.provider || 'groq'),
    apiKey: cfg.apiKey,
    model: cfg.model || d.model,
    fallbackModel: cfg.fallbackModel !== undefined ? cfg.fallbackModel : d.fallbackModel,
    endpoint: cfg.endpoint || ENDPOINTS[kind],
    temperature: cfg.temperature != null ? Number(cfg.temperature) : 0.15,
    maxTokens: Number(cfg.maxTokens || 2400),
    // Anthropic: a key made at organisation level must name the workspace it bills to
    workspaceId: cfg.workspaceId || null
  };
}

/* ── Anthropic: translate to and from the Messages API ─────────────────── */

function toAnthropicBody(model, messages, opts, cfg) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    // the API insists on alternating roles; merge a repeated role into one turn
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else turns.push({ role: m.role, content: m.content });
  }
  if (!turns.length || turns[0].role !== 'user') turns.unshift({ role: 'user', content: '(no question)' });
  const b = {
    model,
    max_tokens: opts.maxTokens || cfg.maxTokens,
    temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
    messages: turns,
    stream: !!opts.stream
  };
  if (system) b.system = system;
  return b;
}

/* Anthropic SSE -> OpenAI-style SSE. Events arrive as "event: x\ndata: {...}\n\n";
   only content_block_delta/text_delta carries answer text. Errors mid-stream
   come as an "error" event; they are forwarded as a final chunk so the reader
   shows the message instead of a silent stop. */
function anthropicStreamToOpenAI(body) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '';
  const chunk = text => enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = block.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            let j; try { j = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
            if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text)
              controller.enqueue(chunk(j.delta.text));
            else if (j.type === 'error')
              controller.enqueue(chunk('\n\n[' + ((j.error && j.error.message) || 'provider error') + ']'));
          }
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });
}

function anthropicJsonToOpenAI(j) {
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

/* ── the call ──────────────────────────────────────────────────────────── */

async function callModel(rawCfg, messages, opts) {
  opts = opts || {};
  const cfg = normalise(rawCfg);
  const models = [cfg.model, cfg.fallbackModel].filter(Boolean);
  let last = null;

  const send = async (model, effort) => {
    const signal = AbortSignal.timeout(opts.timeout || 60000);
    if (cfg.kind === 'anthropic') {
      const r = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: Object.assign({
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01'
        }, cfg.workspaceId ? { 'anthropic-workspace-id': cfg.workspaceId } : {}),
        body: JSON.stringify(toAnthropicBody(model, messages, opts, cfg)),
        signal
      });
      if (!r.ok) return r;
      if (opts.stream) return { ok: true, status: 200, body: anthropicStreamToOpenAI(r.body) };
      const j = await r.json();
      return { ok: true, status: 200, json: async () => anthropicJsonToOpenAI(j), text: async () => JSON.stringify(j) };
    }
    const b = {
      model,
      temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
      max_tokens: opts.maxTokens || cfg.maxTokens,
      stream: !!opts.stream,
      messages
    };
    if (effort) b.reasoning_effort = effort;
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(b),
      signal
    });
  };

  for (let i = 0; i < models.length; i++) {
    let r;
    try {
      r = await send(models[i], cfg.kind === 'openai' ? opts.reasoningEffort : null);
      if (!r.ok && opts.reasoningEffort && cfg.kind === 'openai') {
        const t0 = await r.text();
        // a model that does not know the parameter simply gets the call again without it
        if (/reasoning/i.test(t0)) r = await send(models[i], null);
        else r = { ok: false, status: r.status, text: async () => t0 };
      }
    } catch (e) {
      last = { status: 504, text: e.name === 'TimeoutError'
        ? 'The provider did not answer in time.' : String(e.message || e) };
      continue;
    }
    if (r.ok) { if (i > 0 && opts.log) opts.log('[ai] fell back to ' + models[i]); return r; }
    const t = await r.text();
    last = { status: r.status, text: t };
    const retryable = r.status === 404 || r.status === 429 || r.status === 529 || r.status === 503 ||
                      /decommission|does not exist|not found|not_found|overloaded|model/i.test(t);
    if (!retryable) break;
  }
  const e = new Error(last ? String(last.text).slice(0, 600) : 'no model configured');
  e.status = last ? last.status : 502;
  throw e;
}

module.exports = { callModel, normalise, ENDPOINTS, DEFAULT_MODELS };
