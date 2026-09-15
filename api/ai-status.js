/* GET /api/ai-status — is the Ask panel available on this deployment?
 *
 * The reader hides the Ask button when it is not. Returns the model NAME so the
 * panel can show what answered; it must never return the key, and there is no
 * endpoint here that does (the desktop app has /api/ai-models, which proxies a
 * provider call with the key attached - that stays off the public build).
 */
const { config } = require('./_groq');

module.exports = (req, res) => {
  const cfg = config();
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    enabled: !!cfg,
    model: cfg ? cfg.model : null,
    provider: cfg ? cfg.provider : null
  });
};
