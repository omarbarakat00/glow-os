// api/meta.js
// Vercel serverless function — proxies Meta Marketing API
// Env vars required: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN      = process.env.META_ACCESS_TOKEN;
  const ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID; // e.g. 1524022621557206

  if (!TOKEN || !ACCOUNT_ID) {
    return res.status(500).json({ error: 'Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in Vercel env vars.' });
  }

  const BASE = 'https://graph.facebook.com/v21.0';

  async function meta(path, params = {}) {
    const u = new URL(`${BASE}${path}`);
    u.searchParams.set('access_token', TOKEN);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const r = await fetch(u.toString());
    const data = await r.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
    return data;
  }

  // Meta returns actions as [{action_type, value}]. This finds a specific type.
  function action(actions, type) {
    const a = (actions || []).find(x => x.action_type === type);
    return parseFloat(a?.value || 0);
  }

  try {
    const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,cpm,ctr,actions';

    const [todayData, yestData, campaigns, ads] = await Promise.all([
      // Account-level totals for today
      meta(`/act_${ACCOUNT_ID}/insights`, {
        date_preset: 'today',
        fields: INSIGHT_FIELDS,
        level: 'account',
      }),
      // Account-level totals for yesterday (for delta indicators)
      meta(`/act_${ACCOUNT_ID}/insights`, {
        date_preset: 'yesterday',
        fields: INSIGHT_FIELDS,
        level: 'account',
      }),
      // Active/paused campaigns with today's breakdown
      meta(`/act_${ACCOUNT_ID}/campaigns`, {
        effective_status: ['ACTIVE', 'PAUSED'],
        fields: `name,status,insights.date_preset(today){spend,actions,impressions}`,
        limit: 25,
      }),
      // Active ads — to find best performer
      meta(`/act_${ACCOUNT_ID}/ads`, {
        effective_status: ['ACTIVE'],
        fields: `name,status,insights.date_preset(today){spend,actions}`,
        limit: 50,
      }),
    ]);

    const t = todayData.data?.[0] || {};
    const y = yestData.data?.[0]  || {};

    const spend     = parseFloat(t.spend || 0);
    const purchases = action(t.actions, 'purchase');
    const cpa       = purchases > 0 ? spend / purchases : 0;

    const ySpend     = parseFloat(y.spend || 0);
    const yPurchases = action(y.actions, 'purchase');
    const yCpa       = yPurchases > 0 ? ySpend / yPurchases : 0;

    // Campaign rows
    const campaignRows = (campaigns.data || []).map(c => {
      const ci    = c.insights?.data?.[0] || {};
      const cPurch = action(ci.actions, 'purchase');
      const cSpend = parseFloat(ci.spend || 0);
      return {
        name:      c.name,
        status:    c.status,
        spend:     Math.round(cSpend),
        purchases: cPurch,
        cpa:       cPurch > 0 ? Math.round(cSpend / cPurch) : 0,
      };
    });

    // Best ad by purchase count today
    let bestAd    = null;
    let bestPurch = 0;
    for (const ad of ads.data || []) {
      const ai    = ad.insights?.data?.[0] || {};
      const p     = action(ai.actions, 'purchase');
      const s     = parseFloat(ai.spend || 0);
      if (p > bestPurch) {
        bestPurch = p;
        bestAd = {
          name:      ad.name,
          purchases: p,
          spend:     Math.round(s),
          cpa:       p > 0 ? Math.round(s / p) : 0,
        };
      }
    }

    res.json({
      spend:       Math.round(spend),
      purchases,
      cpa:         Math.round(cpa),
      ctr:         parseFloat(parseFloat(t.ctr  || 0).toFixed(2)),
      cpm:         Math.round(parseFloat(t.cpm  || 0)),
      reach:       parseInt(t.reach || 0),
      impressions: parseInt(t.impressions || 0),
      campaigns:   campaignRows,
      best_ad:     bestAd,
      yesterday: {
        spend:     Math.round(ySpend),
        purchases: yPurchases,
        cpa:       Math.round(yCpa),
      },
    });
  } catch (e) {
    console.error('[Meta]', e);
    res.status(500).json({ error: e.message });
  }
};
