/* ClauseFinder — the online build's configuration.
 *
 * sync.py copies this file over cf-config.js when it publishes the app to the
 * site. It is the ONLY difference between the desktop reader and the one at
 * lumoship.org/clausefinder/ — same HTML, same app.js, same ask.js.
 *
 * Three things change and each has a reason:
 *
 *   dataBase   The rule books are 217 MB and the site's budget is 100 MB, so
 *              they live in Supabase Storage and arrive over its CDN. The site
 *              itself carries only the reader.
 *
 *   semantic   There is no Node process online to hold the vector index, so the
 *              question is embedded in the tab and the index is scanned there.
 *              See lib/semantic-web.js for why that beats a serverless function.
 *
 *   noStore    Locally the data is rebuilt under a running app, so the cache is
 *              a hazard. Online it is immutable and the cache is the budget:
 *              without it every reload pulls an 11 MB index again.
 *
 *   dataVersion  Appended to the books.json URL. The CDN caches every object for
 *              a year; bump this whenever a book is added or removed, or the
 *              old registry keeps being served and the new book stays hidden.
 */
window.CF_CONFIG = {
  dataBase: 'https://mmjdgxvxtjippjktajdd.supabase.co/storage/v1/object/public/clausefinder/',
  apiBase: '/api/',
  semantic: 'browser',
  noStore: false,
  dataVersion: '20260916b'  // + LR Materials, + BV NR467 Parts A-F (replaces Part B). Bump when a book is added: browsers cache
                            // books.json for a year (the CDN purges itself on upsert).
};
