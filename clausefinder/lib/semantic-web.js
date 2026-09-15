/* Semantic clause search, run in the browser.
 *
 * The desktop app answers /api/semantic from server.js: it holds the int8 index
 * in memory and embeds the question with ONNX Runtime on the CPU. Online there
 * is no such server - the site is static files plus two small functions - so the
 * same two steps happen in the tab.
 *
 * Why not put it in a serverless function instead: the function would have to
 * load a 23 MB model and an 11 MB index on every cold start, and pay for both on
 * every question. In the browser the model is fetched once and kept by the HTTP
 * cache, the vectors are fetched once per book, and the scan is 30k dot products
 * of 384 int8 values - a few milliseconds. The work belongs where the data ends
 * up anyway.
 *
 * The numbers must match lib/embed.js exactly, or the query and the index are
 * measured on different rulers:
 *   - same model (Xenova/all-MiniLM-L6-v2, 384 dims)
 *   - mean pooling, L2 normalised
 *   - index rows are int8, scaled by 127
 * vectors.json carries the model name and dimension; if either disagrees with
 * what we are about to do, the index is IGNORED rather than silently scored
 * against the wrong vectors.
 */
'use strict';

const SW = {
  DIM: 384,
  MODEL: 'Xenova/all-MiniLM-L6-v2',
  lib: null,          // transformers.js module
  pipe: null,         // feature-extraction pipeline
  loading: null,
  books: new Map(),   // bookId -> { bin: Int8Array, keys: [...], count } | null
  fetching: new Map(),
  state: 'idle'       // idle | loading | ready | failed
};

/* The library is not bundled: it is a big dependency that only matters the first
   time someone asks a question. Loading it on demand keeps the reader itself
   instant for people who never open the Ask panel. */
async function swLib() {
  if (SW.lib) return SW.lib;
  const src = (window.CF_CONFIG && window.CF_CONFIG.transformersUrl) ||
              'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  SW.lib = await import(/* webpackIgnore: true */ src);
  return SW.lib;
}

async function swEmbedder() {
  if (SW.pipe) return SW.pipe;
  if (!SW.loading) SW.loading = (async () => {
    SW.state = 'loading';
    try {
      const t = await swLib();
      // The model is fetched from the HF CDN and kept by the browser cache.
      // q8 matches the desktop build; a different dtype would change the
      // vectors enough to matter against an int8 index built at q8.
      SW.pipe = await t.pipeline('feature-extraction', SW.MODEL, { dtype: 'q8' });
      SW.state = 'ready';
      return SW.pipe;
    } catch (e) {
      SW.state = 'failed';
      SW.loading = null;
      throw e;
    }
  })();
  return SW.loading;
}

/* question -> Float32Array(384), L2 normalised */
async function swEmbed(text) {
  const fe = await swEmbedder();
  // 900 chars, the same cut lib/semantic.js makes. A longer question would be
  // embedded differently here than the desktop app embeds it.
  const out = await fe([String(text || '').slice(0, 900)], { pooling: 'mean', normalize: true });
  return out.data.slice(0, SW.DIM);
}

/* One book's index. Returns null when the book has no index, or has one built
   by a different model - scoring against that would produce confident nonsense. */
async function swIndex(bookId) {
  if (SW.books.has(bookId)) return SW.books.get(bookId);
  if (SW.fetching.has(bookId)) return SW.fetching.get(bookId);

  const p = (async () => {
    try {
      const base = dataUrl(bookId + '/');
      const [meta, buf] = await Promise.all([
        fetch(base + 'vectors.json').then(r => (r.ok ? r.json() : null)),
        fetch(base + 'vectors.bin').then(r => (r.ok ? r.arrayBuffer() : null))
      ]);
      if (!meta || !buf) return null;
      if (meta.model !== SW.MODEL || meta.dim !== SW.DIM) {
        console.warn('semantic: ' + bookId + ' index was built by ' + meta.model +
                     '/' + meta.dim + ', ignoring');
        return null;
      }
      if (buf.byteLength !== meta.count * SW.DIM) {
        console.warn('semantic: ' + bookId + ' index size does not match its count, ignoring');
        return null;
      }
      return { bin: new Int8Array(buf), keys: meta.keys, count: meta.count };
    } catch (e) {
      console.warn('semantic: ' + bookId + ' index unreadable - ' + (e.message || e));
      return null;
    }
  })().then(v => { SW.books.set(bookId, v); SW.fetching.delete(bookId); return v; });

  SW.fetching.set(bookId, p);
  return p;
}

/* cosine between the float query and one int8 row */
function swDot(q, bin, off) {
  let s = 0;
  for (let i = 0; i < SW.DIM; i++) s += q[i] * bin[off + i];
  return s / 127;
}

/* Same contract as POST /api/semantic:
   -> [{ b, s, a, score }], best first  */
async function swSearch(question, bookIds, k, sectionIds) {
  const want = (sectionIds && sectionIds.length) ? new Set(sectionIds) : null;
  const idx = [];
  for (const id of (bookIds || [])) {
    const e = await swIndex(id);
    if (e) idx.push([id, e]);
  }
  if (!idx.length) return [];

  const q = await swEmbed(question);

  // A small top-k heap would save little here: the scan is the cost, not the
  // sort, and k is ~36.
  const hits = [];
  for (const [bookId, e] of idx) {
    for (let i = 0; i < e.count; i++) {
      const key = e.keys[i];                 // "sectionId|clauseAnchor"
      if (want) {
        // LAST pipe, not the first: lib/semantic.js splits it that way and a
        // section id is free to contain one. Splitting on the first would send
        // a narrowed scope looking for a section that does not exist, and the
        // scope would silently return nothing.
        const cut = key.lastIndexOf('|');
        if (!want.has(cut < 0 ? key : key.slice(0, cut))) continue;
      }
      const score = swDot(q, e.bin, i * SW.DIM);
      hits.push({ b: bookId, key, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);

  return hits.slice(0, k || 30).map(h => {
    const cut = h.key.lastIndexOf('|');
    return { b: h.b, s: cut < 0 ? h.key : h.key.slice(0, cut),
             a: cut < 0 ? '' : h.key.slice(cut + 1), score: h.score };
  });
}

const swReady = () => SW.state === 'ready';
const swState = () => SW.state;
