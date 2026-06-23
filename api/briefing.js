// api/briefing.js
// Vercel serverless function — generates AI briefing from real data, server-side.
// Env vars required: ANTHROPIC_API_KEY
//
// POST body: { shopify, meta, finance }
// Returns:   { briefing: string, fin_summary: string, alerts: [] }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'Set ANTHROPIC_API_KEY in Vercel env vars.' });

  const { shopify = {}, meta = {}, finance = {} } = req.body || {};

  // ── Compute derived metrics ──────────────────────────────────────────────
  const roas       = meta.spend > 0 ? (shopify.rev_today / meta.spend).toFixed(1) : 'N/A';
  const mtdPct     = shopify.rev_mtd > 0 ? ((shopify.rev_mtd / 2_000_000) * 100).toFixed(1) : '0';
  const retPct     = ((shopify.return_rate || 0) * 100).toFixed(1);
  const cogsPct    = ((finance.cogs || 0) * 100).toFixed(1);
  const marginPct  = ((finance.margin || 0) * 100).toFixed(1);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Africa/Cairo',
  });

  // ── Rule-based alerts (no AI needed, instant) ────────────────────────────
  const alerts = [];

  if ((shopify.return_rate || 0) > 0.20) {
    alerts.push({ type: 'red',    msg: `**Return rate at ${retPct}%** — above your 20% target. Investigate top return reasons.` });
  } else {
    alerts.push({ type: 'green',  msg: `Return rate at **${retPct}%** — within your ≤20% target ✓` });
  }

  if ((finance.float || 0) > 500_000) {
    alerts.push({ type: 'yellow', msg: `**COD Float: ${(finance.float).toLocaleString()} EGP** held by carriers — chase settlement this week.` });
  }

  const roasNum = meta.spend > 0 ? shopify.rev_today / meta.spend : 0;
  if (roasNum > 0 && roasNum < 5) {
    alerts.push({ type: 'yellow', msg: `**ROAS at ${roasNum.toFixed(1)}x** today — below 5x target. Check campaign performance.` });
  } else if (roasNum >= 5) {
    alerts.push({ type: 'green',  msg: `**ROAS at ${roasNum.toFixed(1)}x** today — strong performance ✓` });
  }

  if ((finance.cogs || 0) > 0.40) {
    alerts.push({ type: 'red',    msg: `**COGS at ${cogsPct}%** — above your 40% ceiling. Review supplier costs.` });
  }

  // ── Finance summary (rule-based, no AI) ──────────────────────────────────
  const fin_summary = finance.profit
    ? `Gross margin is at **${marginPct}%** ${parseFloat(marginPct) >= 60 ? '— above your 60% floor ✓' : '— below your 60% target'}.` +
      (finance.float > 500_000
        ? ` COD float of **${(finance.float).toLocaleString()} EGP** remains the biggest cash flow constraint.`
        : '') +
      (finance.cash ? ` Cash position: **${(finance.cash).toLocaleString()} EGP**.` : '')
    : 'No finance data loaded yet.';

  // ── AI daily briefing via Claude Haiku (fast + cheap) ────────────────────
  let briefing = '';
  try {
    const prompt = `You are the CFO assistant for Glow Modest Wear, an Egyptian DTC fashion brand owned by Omar Barakat. Write a sharp, direct daily briefing (2-3 sentences max) based on today's live business data. Use **bold** for key numbers. Be specific — highlight what's strong and what needs attention.

Today: ${today}

REAL DATA:
- Revenue today: ${(shopify.rev_today || 0).toLocaleString()} EGP | Orders: ${shopify.orders_today || 0} | AOV: ${(shopify.aov || 0).toLocaleString()} EGP
- MTD Revenue: ${(shopify.rev_mtd || 0).toLocaleString()} EGP (${mtdPct}% of 2M target)
- Return rate: ${retPct}% (target ≤20%)
- Meta spend: ${(meta.spend || 0).toLocaleString()} EGP | Purchases: ${meta.purchases || 0} | CPA: ${(meta.cpa || 0).toLocaleString()} EGP | ROAS: ${roas}x
- Net profit June MTD: ${(finance.profit || 0).toLocaleString()} EGP
- Cash: ${(finance.cash || 0).toLocaleString()} EGP | COD float: ${(finance.float || 0).toLocaleString()} EGP

Respond with just the briefing text — no labels, no headers.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 250,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    briefing = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
  } catch (e) {
    console.error('[Briefing AI]', e);
    // Fallback to a rule-based briefing if Claude call fails
    briefing = `MTD revenue at **${(shopify.rev_mtd || 0).toLocaleString()} EGP** (${mtdPct}% of target) from **${shopify.orders_today || 0}** orders today. Meta ROAS at **${roas}x** with CPA of **${(meta.cpa || 0).toLocaleString()} EGP**.`;
  }

  res.json({ briefing, fin_summary, alerts });
};
