/* ClauseFinder — Ask panel.
   Retrieval-grounded: the search engine picks the clauses, the model may only
   answer from those, and every claim it makes is cited back to a clause.
   Loads after app.js and reuses its globals (S, scoreClause, parseQuery, go, …). */
'use strict';

const AI = { enabled: false, model: null, busy: false, ctl: null, history: [] };

const STOP = new Set(('a an the of for to in on at by from with and or as is are be been was were it its this that these ' +
  'those shall should must may can not no any all what which where when who how why do does did if then than there here ' +
  'into onto about over under such per each other same both between within also more most less least ' +
  'nedir nasil ne icin bir bu su ve veya ile ise mi mu kadar gore hangi kac neden nerede olan olarak ' +
  'hangisi durumda durumlarda gerekli gerekir yapilir hesaplanir hesaplanmasi midir mudur').split(' '));

// Turkish letters are separators in the tokeniser, so "kalınlığı" would shatter
// into "kal" + "nl" and then match rule text at random. Fold first.
const foldTr = s => String(s || '')
  .replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u')
  .replace(/[şŞ]/g, 's').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c');

async function initAI() {
  try {
    const st = await fetch(apiUrl('ai-status'), { cache: 'no-store' }).then(r => r.json());
    AI.enabled = !!st.enabled;
    AI.model = st.model;
    if (AI.enabled) {
      document.querySelector('#askBtn').hidden = false;
      document.querySelector('#svAsk').hidden = false;
      document.querySelector('#askModel').textContent = (st.provider || '') + ' · ' + (st.model || '');
    }
  } catch (e) { AI.enabled = false; }
}

/* ══════════════════ retrieval — the app's own search engine ══════════════════ */

// A clause sitting in a section actually called "Corrosion protection" beats the
// same words buried in a survey table. This is the search page's title boost.
function titleBoost(sec, terms) {
  const hay = ((sec.label || '') + ' ' + (sec.title || '') + ' ' +
               ((sec.chap && sec.chap.title) || '') + ' ' +
               ((sec.part && sec.part.title) || '')).toLowerCase();
  let tb = 0;
  for (const t of terms) {
    if (!t || !hay.includes(t)) continue;
    // a phrase in a section title is a strong signal; a single short word is not
    tb += t.includes(' ') ? 240 : (t.length >= 6 ? 110 : 0);
  }
  return tb;
}

// attach section/book, spread the evidence, cut to k
function finish(list, k, perSecCap) {
  const perSec = new Map(), keep = [];
  for (const r of list) {
    const e = S.lib.get(r.c.b);
    const sec = e && e.secMap.get(r.c.s);
    if (!sec) continue;
    r.sec = sec; r.book = e.meta;
    const key = r.c.b + '|' + r.c.s;
    const n = (perSec.get(key) || 0) + 1;
    if (n > (perSecCap || 3)) continue;
    perSec.set(key, n);
    keep.push(r);
    if (keep.length >= k) break;
  }
  return keep;
}

/* ── which books a question is about ─────────────────────────────────────
   "DNV kurallarına göre …" while an LR book is open: the question names the
   society, so the society decides. Set per question by ask(), read by every
   retriever here in place of scopedBooks(). */
let ASK_BOOKS = null;      // array of books when the question overrides the scope
let ASK_SOC = null;        // the society it named
const SOC_WORDS = [
  [/\b(dnv|dnvgl|dnv[- ]gl|det norske)\b/i, 'DNV'],
  [/\b(lr|lloyd'?s?|lloyds register|lloyd)\b/i, 'LR'],
  [/\b(bv|bureau veritas|nr ?467|nr ?615)\b/i, 'BV'],
  [/\b(fsicr|traficom|finnish[- ]swedish|ice class regulation|buz klas)/i, 'FSICR']
];
function societyNamed(question) {
  for (const [re, soc] of SOC_WORDS) if (re.test(question)) return soc;
  return null;
}
function askBooks() { return ASK_BOOKS || scopedBooks(); }
function askSections() { return ASK_BOOKS ? null : scopedSections(); }

function scoreAll(q) {
  const out = [];
  const secOnly = askSections();
  for (const b of askBooks()) {
    const e = S.lib.get(b.id);
    if (!e || !e.clauses) continue;
    for (const c of e.clauses) {
      if (secOnly && !secOnly.has(c.s)) continue;
      const r = scoreClause(c, q);
      if (r) out.push(r);
    }
  }
  out.sort((a, b) => b.sc - a.sc);
  return out;
}

// straight question -> clauses
function retrieve(question, k) {
  const q = parseQuery(foldTr(question), false);
  q.words = q.words.filter(w => w.length > 2 && !STOP.has(w));
  q.terms = [...q.phrases, ...q.words];
  q.empty = !q.terms.length && !q.nums.length;
  if (q.empty) return [];

  const scored = scoreAll(q);
  const boost = new Map();
  for (const r of scored) {
    const key = r.c.b + '|' + r.c.s;
    if (!boost.has(key)) {
      const e = S.lib.get(r.c.b), sec = e && e.secMap.get(r.c.s);
      boost.set(key, sec ? titleBoost(sec, q.terms) : 0);
    }
    r.sc += boost.get(key);
  }
  scored.sort((a, b) => b.sc - a.sc);
  return finish(scored, k || 14);
}

/* Several English terms -> clauses. Ranked by section, not by clause: a section
   that covers more of the terms, or whose own title carries one, wins over a
   long table that happens to repeat a single term. */
function retrieveTerms(terms, k) {
  const clean = terms.map(t => String(t).replace(/"/g, '').trim().toLowerCase())
                     .filter(t => t.length > 2);
  const bySec = new Map();

  for (const t of clean) {
    // the exact phrase first; then the same words in any order and with words between
    // ("one side continuous weld" must also find "one side continuous fillet welding"),
    // scored a little lower so a verbatim hit still wins
    const strict = parseQuery('"' + t + '"', false);
    const loose = parseQuery(t, false);
    loose.words = loose.words.filter(w => w.length > 2 && !STOP.has(w)); loose.terms = loose.words; loose.empty = !loose.words.length;
    const runs = [];
    if (!strict.empty) runs.push(scoreAll(strict).slice(0, 60));
    if (!loose.empty && loose.words.length > 1) runs.push(scoreAll(loose).slice(0, 40).map(r => ({ c: r.c, sc: Math.round(r.sc * 0.8), hits: r.hits })));
    for (const r of [].concat(...runs)) {
      const key = r.c.b + '|' + r.c.s;
      let g = bySec.get(key);
      if (!g) {
        const e = S.lib.get(r.c.b), sec = e && e.secMap.get(r.c.s);
        if (!sec) continue;
        g = { sec, meta: e.meta, cov: new Set(), best: 0, cands: new Map() };
        bySec.set(key, g);
      }
      g.cov.add(t);
      g.best = Math.max(g.best, r.sc);
      const prev = g.cands.get(r.c.a);
      if (prev) { prev.sc = Math.max(prev.sc, r.sc); prev.cov++; prev.terms.add(t); }
      else g.cands.set(r.c.a, { c: r.c, sc: r.sc, hits: r.hits.slice(), cov: 1, terms: new Set([t]) });
    }
  }

  const groups = [...bySec.values()];
  for (const g of groups) g.score = g.cov.size * 200 + titleBoost(g.sec, clean) + g.best;
  groups.sort((a, b) => b.score - a.score);

  // Rank every candidate by its section's standing plus its own score, then take the
  // best with at most six from one section. A round robin over sections (one clause
  // each, first round) starved subjects that live in a single section — welding is
  // one section of Pt 3 Ch 13, and its 2.3.3 never surfaced behind thirty one-off hits.
  // …and at most two clauses per (section, search term), so one strong term
  // ("partial penetration weld") cannot fill a section's quota and push out the
  // clauses the other terms found ("one side continuous weld" → 2.3.3).
  const want = k || 14, out = []; const perSec = new Map(), perSecTerm = new Map();
  const flat = [];
  for (const g of groups) for (const r of g.cands.values()) { r.sec = g.sec; r.book = g.meta; r.gs = g.score; r.rank = g.score * 0.6 + r.sc + (r.cov > 1 ? 40 : 0); flat.push(r); }
  flat.sort((a, b) => b.rank - a.rank);
  const pick = (r, strictTerm) => {
    const key = r.c.b + '|' + r.c.s; const n = (perSec.get(key) || 0) + 1; if (n > 6) return false;
    if (strictTerm) { const tk = key + '|' + [...r.terms][0]; const m = (perSecTerm.get(tk) || 0) + 1; if (r.cov < 2 && m > 2) return false; perSecTerm.set(tk, m); }
    perSec.set(key, n); out.push(r); return true;
  };
  for (const r of flat) { if (out.length >= want) break; pick(r, true); }
  for (const r of flat) { if (out.length >= want) break; if (!out.includes(r)) pick(r, false); }
  return out;
}

function mergeHits(a, b, k) {
  const seen = new Set(), out = [];
  for (const r of [...a, ...b]) {
    const key = r.c.b + '|' + r.c.s + '|' + r.c.a;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

/* ── semantic retrieval ───────────────────────────────────────────────────────
   The lexical index scores word overlap, so it only finds a clause when the
   question happens to use the rule's own vocabulary.  Ask about a "bollard" and
   nothing matches, because the rules file it under mooring equipment and deck
   fittings.  The vector index answers on meaning instead, and the two are fused
   below rather than one replacing the other: lexical is still the better judge
   of an exact term, a symbol or a clause number. */
let SEMANTIC = null;   // null = unknown, false = no index available

// The index lives on the server locally and in the tab online. Both answer the
// same shape, so only the call differs - see lib/semantic-web.js for why the
// online build does the scan in the browser instead of in a function.
async function semanticRaw(question, k) {
  const books = askBooks().map(b => b.id);
  const secs = askSections() ? [...askSections()] : null;

  if (CFG.semantic === 'browser') {
    if (typeof swSearch !== 'function') throw new Error('semantic-web.js not loaded');
    return { hits: await swSearch(question, books, k, secs) };
  }
  const r = await fetch(apiUrl('semantic'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: question, books, k, sections: secs })
  });
  if (!r.ok) throw new Error('semantic ' + r.status);
  return r.json();
}

async function semanticHits(question, k) {
  if (SEMANTIC === false) return [];
  try {
    const j = await semanticRaw(question, k);
    SEMANTIC = true;
    const out = [];
    for (const h of (j.hits || [])) {
      const e = S.lib.get(h.b);
      if (!e || !e.clauses) continue;
      // built once per book: a scan per hit would be 30k comparisons x 36 hits
      if (!e.clauseMap) {
        e.clauseMap = new Map();
        for (const c of e.clauses) e.clauseMap.set(c.s + '|' + c.a, c);
      }
      const c = e.clauseMap.get(h.s + '|' + h.a);
      if (c) out.push({ c, sc: h.score * 100, hits: [], sem: true });
    }
    return out;
  } catch (e) { SEMANTIC = false; return []; }
}

/* Reciprocal rank fusion: rank is comparable across the two engines, raw scores
   are not (word counts against cosine).  A clause both engines like rises above
   one that either alone loves. */
function fuse(lists, k) {
  const acc = new Map();
  lists.forEach(({ list, w }) => list.forEach((r, i) => {
    const key = r.c.b + '|' + r.c.s + '|' + r.c.a;
    const cur = acc.get(key) || { r, f: 0 };
    cur.f += (w || 1) / (12 + i);
    if (!cur.r.hits || !cur.r.hits.length) cur.r = r.hits && r.hits.length ? r : cur.r;
    acc.set(key, cur);
  }));
  const out = [...acc.values()].sort((a, b) => b.f - a.f).map(x => x.r);
  return out.slice(0, k);
}

// Ask the model for the English rule vocabulary behind the question. Without this
// a Turkish question finds nothing, or worse, finds noise.
async function englishTerms(question) {
  try {
    const r = await fetch(apiUrl('keywords'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, book: askBooks().map(b => b.title).join('; ') })
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.terms) ? j.terms : [];
  } catch (e) { return []; }
}

const citeOf = r => r.book.short + ' · ' + plainCrumb(r.sec) + (r.c.n ? ' · clause ' + r.c.n : '');

/* ══════════════════════════════ panel ══════════════════════════════ */

function openAsk(seed) {
  if (!AI.enabled) return;
  document.querySelector('#askPanel').hidden = false;
  document.body.classList.add('ask-open');
  if (seed != null) document.querySelector('#askInput').value = seed;
  if (!document.querySelector('#askLog').children.length) paintAskEmpty();
  document.querySelector('#askInput').focus();
}

function closeAsk() {
  document.querySelector('#askPanel').hidden = true;
  document.body.classList.remove('ask-open');
  if (AI.ctl) AI.ctl.abort();                 // never leave a stream running unseen
}

function paintAskEmpty() {
  const egs = [
    'Hangi durumlarda insert plate gerekli?',
    'What is the minimum plate keel breadth for a 24 m steel craft?',
    'Balast tanklarinin korozyon korumasi hangi maddelerde duzenleniyor?'
  ];
  document.querySelector('#askLog').innerHTML =
    '<div class="ask-empty">Ask a question about the rule books in your library. ' +
    'The answer is written only from clauses the search finds, and each one is cited. ' +
    'Ask in any language — the search itself is always run in English.' +
    egs.map(e => '<button class="eg" data-eg="' + esc(e) + '">' + esc(e) + '</button>').join('') +
    '</div>';
}

/* ── very small markdown + citation renderer ── */
function mdToHtml(t, sources) {
  // The prompt asks for plain-text formulae, but strip math delimiters anyway so a
  // stray LaTeX wrapper never reaches the reader as literal \[ … \].
  let h = esc(t)
    .replace(/\\\[|\\\]|\\\(|\\\)/g, '')
    .replace(/\$\$?/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\,|\\;|\\ /g, ' ');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^\s*#{1,6}\s+/gm, '');
  h = h.replace(/[\[【]\s*(\d+(?:\s*[,،]\s*\d+)*)\s*[\]】]/g, (m, nums) =>
    nums.split(/[,،]/).map(x => {
      const i = parseInt(x.trim(), 10);
      return (sources && sources[i - 1])
        ? '<span class="cit" data-cit="' + i + '" title="' + esc(sources[i - 1].cite) + '">' + i + '</span>'
        : m;
    }).join(''));

  const lines = h.split('\n');
  let out = '', list = null;
  for (const raw of lines) {
    const l = raw.trim();
    const ul = /^[-*•]\s+(.*)$/.exec(l);
    const ol = /^\d+[.)]\s+(.*)$/.exec(l);
    if (ul || ol) {
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { if (list) out += '</' + list + '>'; out += '<' + want + '>'; list = want; }
      out += '<li>' + (ul || ol)[1] + '</li>';
      continue;
    }
    if (list) { out += '</' + list + '>'; list = null; }
    if (l) out += '<p>' + l + '</p>';
  }
  if (list) out += '</' + list + '>';
  return out;
}

function setBusy(on) {
  AI.busy = on;
  const b = document.querySelector('#askSend');
  b.classList.toggle('stop', on);
  b.title = on ? 'Stop' : 'Send (Enter)';
}

async function askSubmit(question) {
  question = String(question || '').trim();
  if (AI.busy || !question) return;
  setBusy(true);

  const log = document.querySelector('#askLog');
  if (log.querySelector('.ask-empty')) log.innerHTML = '';

  // only follow the stream down if the reader is already at the bottom
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const follow = () => { if (stick) log.scrollTop = log.scrollHeight; };
  let stick = true;

  log.insertAdjacentHTML('beforeend', '<div class="qbub">' + esc(question) + '</div>');
  const wrap = document.createElement('div');
  wrap.innerHTML = '<div class="ask-think"><span class="dot"></span>Reading the rule books…</div>';
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  const think = t => { const el = wrap.querySelector('.ask-think'); if (el) el.innerHTML = '<span class="dot"></span>' + esc(t); };

  const stop = msg => {
    if (msg) wrap.innerHTML = '<div class="ask-err">' + esc(String(msg).slice(0, 600)) + '</div>';
    setBusy(false); AI.ctl = null;
  };

  for (let i = 0; i < 2 && !allIndexed(); i++)
    await Promise.all(missingBooks().map(b => ensureIndex(b.id).catch(() => {})));

  /* ── which books: the society the question names wins over the open book ── */
  ASK_BOOKS = null; ASK_SOC = null;
  {
    const soc = societyNamed(question);
    if (soc) {
      const inScope = scopedBooks().some(b => societyOf(b) === soc);
      const owned = booksOf(soc);
      if (!inScope && owned.length) { ASK_BOOKS = owned; ASK_SOC = soc; think('Question names ' + soc + ' — searching its books'); }
    }
  }

  /* ── retrieval, with an English pass when the plain question is weak ── */
  const K = 18;
  let lex = retrieve(question, K * 2);
  let terms = [];
  const foreign = /[^\x00-\x7F]/.test(question) || /[ıİğĞşŞ]/.test(question);

  // The vector search runs on the question as asked; unlike the lexical pass it
  // does not need the English terms first, so fire it now and collect it below.
  const semP = semanticHits(question, K * 2);

  if (AI.enabled && (foreign || lex.length < 6 || !lex.length || lex[0].sc < 70)) {
    think('Working out the English rule terms…');
    terms = await englishTerms(question);
    if (terms.length) {
      think('Searching: ' + terms.slice(0, 6).join(', '));
      const alt = retrieveTerms(terms, K * 2);
      if (alt.length) lex = foreign ? alt : mergeHits(alt, lex, K * 2);
    }
  }

  let sem = await semP;
  // the embedding model reads English: a Turkish question embeds poorly, so the
  // English terms get their own semantic pass and the two are fused
  if (foreign && terms.length) {
    try { const sem2 = await semanticHits(terms.join('. '), K * 2); if (sem2.length) sem = sem.length ? finish(fuse([{ list: sem, w: 0.6 }, { list: sem2, w: 1 }], K * 2), K * 2, 4) : sem2; } catch (_) {}
  }
  if (sem.length) think('Matching on meaning…');
  let hits = sem.length
    ? finish(fuse([{ list: lex, w: 1 }, { list: sem, w: 1 }], K * 2), K, 6)
    : lex.slice(0, K);

  if (!hits.length) {
    stop('No clause in your rule books matches that closely enough to answer from' +
         (terms.length ? ' (searched for: ' + terms.join(', ') + ')' : '') +
         '. Try naming the component or the rule term you are after.');
    return;
  }

  const sources = hits.map(r => ({
    cite: citeOf(r), text: r.c.t, cut: r.c.t.length >= 1500,
    b: r.c.b, s: r.c.s, a: r.c.a, title: r.sec.title || r.sec.label, n: r.c.n
  }));
  const nBooks = new Set(hits.map(h => h.c.b)).size;
  think('Reading ' + sources.length + ' clauses from ' + nBooks + ' book' + (nBooks > 1 ? 's' : '') + '…');

  const body = document.createElement('div');
  body.className = 'abub';
  let text = '', started = false, aborted = false;

  AI.ctl = new AbortController();
  try {
    const res = await fetch(apiUrl('ask'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AI.ctl.signal,
      body: JSON.stringify({
        question,
        history: AI.history.slice(-4),
        passages: sources.map(s => ({ cite: s.cite, text: s.text, cut: s.cut }))
      })
    });
    if (!res.ok) {
      let msg = 'The assistant could not be reached (HTTP ' + res.status + ').';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
      stop(msg);
      return;
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        const t = l.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') continue;
        try {
          const j = JSON.parse(d);
          const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (piece) {
            text += piece;
            if (!started) { started = true; wrap.innerHTML = ''; wrap.appendChild(body); }
            stick = atBottom();
            body.innerHTML = mdToHtml(text, sources);
            follow();
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') aborted = true;
    else { stop(e.message || e); return; }
  }

  if (!started) {
    wrap.innerHTML = '';
    wrap.appendChild(body);
    body.innerHTML = aborted ? '<p><i>Stopped.</i></p>' : '<p><i>No answer came back.</i></p>';
  } else if (aborted) {
    body.insertAdjacentHTML('beforeend', '<p class="stopped"><i>Stopped.</i></p>');
  }

  if (text.trim()) {
    AI.history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
    AI.history = AI.history.slice(-4);
  }

  // every bracketed number counts, including the 2 in "[1,2]"
  const used = new Set();
  for (const m of text.matchAll(/[\[【]\s*([\d\s,،]+)\s*[\]】]/g))
    for (const n of m[1].split(/[,،\s]+/)) if (n) used.add(+n);

  const box = document.createElement('div');
  box.className = 'srcs';
  box.innerHTML =
    (ASK_SOC ? '<div class="terms">Question named <b>' + esc(ASK_SOC) + '</b> — answered from its books, not the open one</div>' : '') +
    (terms.length ? '<div class="terms">Searched in English for <b>' + esc(terms.join(', ')) +
       '</b> <button class="tsearch" data-terms="' + esc(terms.join(' ')) + '">open in search</button></div>' : '') +
    '<h6>Clauses given to the assistant</h6>' + sources.map((s, i) =>
    '<button class="src' + (used.has(i + 1) ? ' used' : '') + '" data-src="' + i + '">' +
    '<span class="sn">' + (i + 1) + '</span><span class="sc"><b>' + esc(s.title) +
    (s.n ? ' — ' + esc(s.n) : '') + '</b><em>' + esc(s.cite) + (s.cut ? ' · shown in full in the reader' : '') +
    '</em></span></button>').join('');
  wrap.appendChild(box);
  wrap._sources = sources;
  follow();

  setBusy(false);
  AI.ctl = null;
}

function bindAsk() {
  document.querySelector('#askBtn').addEventListener('click', () => openAsk());
  document.querySelector('#askClose').addEventListener('click', closeAsk);
  document.querySelector('#askNew').addEventListener('click', () => {
    if (AI.ctl) AI.ctl.abort();
    AI.history = [];
    paintAskEmpty();
    document.querySelector('#askInput').value = '';
    document.querySelector('#askInput').focus();
  });

  // while a stream is running the send button becomes a stop button
  document.querySelector('#askSend').addEventListener('click', e => {
    if (AI.busy) { e.preventDefault(); if (AI.ctl) AI.ctl.abort(); }
  });
  document.querySelector('#askForm').addEventListener('submit', e => {
    e.preventDefault();
    if (AI.busy) return;
    const v = document.querySelector('#askInput').value;
    document.querySelector('#askInput').value = '';
    askSubmit(v);
  });
  document.querySelector('#askInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.querySelector('#askForm').requestSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); closeAsk(); }
  });

  document.querySelector('#askLog').addEventListener('click', e => {
    const eg = e.target.closest('[data-eg]');
    if (eg) { document.querySelector('#askInput').value = ''; askSubmit(eg.dataset.eg); return; }
    const ts = e.target.closest('[data-terms]');
    if (ts) { location.hash = '#/search?q=' + encodeURIComponent(ts.dataset.terms); return; }
    const wrap = e.target.closest('.ask-log > div');
    const list = wrap && wrap._sources;
    const src = e.target.closest('[data-src]');
    if (src && list) { const s = list[+src.dataset.src]; go(s.b, s.s, s.a); return; }
    const cit = e.target.closest('[data-cit]');
    if (cit && list) { const s = list[+cit.dataset.cit - 1]; if (s) go(s.b, s.s, s.a); return; }
  });

  // From the results page: answer the query that is already on screen.
  document.querySelector('#svAsk').addEventListener('click', () => {
    const q = (document.querySelector('#sq').value || '').trim();
    if (!q) { openAsk(); return; }
    openAsk('');
    askSubmit(q);
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      const q = document.body.classList.contains('mode-search')
        ? (document.querySelector('#sq').value || '').trim() : '';
      openAsk(q || undefined);
    }
  });
}

bindAsk();
initAI();
