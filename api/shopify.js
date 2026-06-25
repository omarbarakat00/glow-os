// api/shopify.js
// Vercel serverless function â proxies Shopify Admin API
// Env vars required: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const STORE = process.env.SHOPIFY_STORE; // e.g. glowmodest.myshopify.com
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!STORE || !TOKEN) {
    return res.status(500).json({ error: 'Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in Vercel env vars.' });
  }

  const BASE = `https://${STORE}/admin/api/2025-01`;
  const HDRS = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

  // Shopify store timezone is UTC+3 (matches Shopify Analytics day boundaries)
  const CAIRO_MS = 3 * 60 * 60 * 1000;

  function cairoDateKey(utcMs) {
    // Returns "YYYY-MM-DD" in Cairo local time
    const d = new Date(utcMs + CAIRO_MS);
    return d.toISOString().slice(0, 10);
  }

  function cairoMidnightUTC(dateKey) {
    // Given "YYYY-MM-DD", returns UTC ms for midnight in Cairo
    return new Date(dateKey + 'T00:00:00Z').getTime() - CAIRO_MS;
  }

  async function shopify(path) {
    const r = await fetch(`${BASE}${path}`, { headers: HDRS });
    const data = await r.json();
    if (!r.ok) throw new Error(data.errors || `Shopify ${r.status}: ${path}`);
    return data;
  }

  async function shopifyGQL(gqlQuery) {
    const r = await fetch(`${BASE}/graphql.json`, {
      method: 'POST',
      headers: { ...HDRS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gqlQuery })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data.errors || data));
    return data;
  }

  // Fetch all orders since a given ISO timestamp, following cursor pagination.
  // Safety cap: 20 pages (5000 orders). Filters out cancelled orders.
  async function fetchOrders(sinceISO, fields) {
    let orders = [];
    let url = `${BASE}/orders.json?status=any&created_at_min=${sinceISO}&limit=250&fields=${fields}`;
    let pages = 0;

    while (url && pages < 20) {
      const r = await fetch(url, { headers: HDRS });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(`Shopify orders API: ${err.errors || r.status}`);
      }
      const data = await r.json();
      orders = orders.concat(data.orders || []);
      pages++;

      // Cursor-based pagination via Link header
      const link = r.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
    return orders;
  }

  function metrics(orders) {
    // Count ALL orders placed (matches Shopify Analytics) â includes cancelled
    const count = orders.length;
    // Revenue only from non-cancelled orders
    const active  = orders.filter(o => !o.cancelled_at);
    const rev     = active.reduce((s, o) => s + parseFloat(o.subtotal_price || o.total_price || 0), 0);
    const refunds = active.filter(o => o.refunds && o.refunds.length > 0).length;
    return {
      rev: Math.round(rev),
      orders: count,
      aov: active.length > 0 ? Math.round(rev / active.length) : 0,
      return_rate: active.length > 0 ? parseFloat((refunds / active.length).toFixed(3)) : 0,
    };
  }

  try {
    const now = Date.now();
    const todayKey = cairoDateKey(now);
    const todayStart = cairoMidnightUTC(todayKey);
    const yestStart = todayStart - 86400000;
    const yestKey = cairoDateKey(yestStart + CAIRO_MS);

    // Month start
    const [y, m] = todayKey.split('-');
    const monthKey = `${y}-${m}-01`;
    const monthStart = cairoMidnightUTC(monthKey);

    // 30 days ago for top-products window
    const thirtyDaysAgo = todayStart - 30 * 86400000;

    // Fetch from whichever is earlier: 30 days ago or month start
    const fetchSince = new Date(Math.min(monthStart, thirtyDaysAgo)).toISOString();

    const FIELDS = 'id,total_price,subtotal_price,line_items,created_at,cancelled_at,refunds';

    const [allOrders, activeCount, draftCount] = await Promise.all([
      fetchOrders(fetchSince, FIELDS),
      shopify('/products/count.json?status=active').then(d => d.count || 0),
      shopify('/products/count.json?status=draft').then(d => d.count || 0),
    ]);

    // Partition orders into time windows
    const todayOrders = allOrders.filter(o => new Date(o.created_at).getTime() >= todayStart);
    const yestOrders  = allOrders.filter(o => {
      const t = new Date(o.created_at).getTime();
      return t >= yestStart && t < todayStart;
    });
    const mtdOrders   = allOrders.filter(o => new Date(o.created_at).getTime() >= monthStart);
    const last30Orders = allOrders.filter(o => new Date(o.created_at).getTime() >= thirtyDaysAgo);

    // 7-day chart: one bucket per Cairo day
    const last7days = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * 86400000;
      const dayEnd   = dayStart + 86400000;
      const dayKey   = cairoDateKey(dayStart + CAIRO_MS);
      const dayRev   = allOrders
        .filter(o => { const t = new Date(o.created_at).getTime(); return t >= dayStart && t < dayEnd; })
        .reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
      last7days.push({ date: dayKey, rev: Math.round(dayRev) });
    }

    // Top products by revenue (last 30 days), aggregated by product title
    const productMap = {};
    for (const order of last30Orders) {
      for (const item of order.line_items || []) {
        const key = item.title || 'Unknown';
        if (!productMap[key]) productMap[key] = { name: key, rev: 0, orders: 0 };
        productMap[key].rev    += parseFloat(item.price || 0) * (item.quantity || 1);
        productMap[key].orders += item.quantity || 1;
      }
    }
    const top = Object.values(productMap)
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 10)
      .map(p => ({
        name: p.name,
        rev: Math.round(p.rev),
        orders: p.orders,
        net: Math.round(p.rev * 0.62), // approx 62% gross margin
      }));

    const today = metrics(todayOrders);
    const yest  = metrics(yestOrders);
    const mtd   = metrics(mtdOrders);

    // Sessions via ShopifyQL GraphQL
    let sessionsToday = 0;
    let sessionsDebug = null;
    try {
      // DEBUG: verify token scopes
      const scopeResp = await shopify('/oauth/access_scopes.json');
      const scopes = (scopeResp?.access_scopes || []).map(s => s.handle);
      sessionsDebug = 'SCOPES:' + scopes.join(',');
      const gql = await shopifyGQL(`{
        shopifyqlQuery(query: "FROM sessions SHOW sessions SINCE today UNTIL today") {
          tableData { rows columns { name dataType } }
          parseErrors
        }
      }`);
      // Surface any GraphQL-level errors (e.g. ACCESS_DENIED for missing read_analytics scope)
      if (gql.errors && gql.errors.length > 0) {
        sessionsDebug = gql.errors[0].message;
      } else {
        const parseErrs = gql?.data?.shopifyqlQuery?.parseErrors || [];
        if (parseErrs.length > 0) {
          sessionsDebug = 'ShopifyQL: ' + JSON.stringify(parseErrs[0]);
        } else {
          const rows = gql?.data?.shopifyqlQuery?.tableData?.rows || [];
          if (rows.length > 0) sessionsToday = parseInt(rows[0].sessions) || 0;
        }
      }
    } catch(e) {
      sessionsDebug = e.message;
      console.warn('[Sessions]', e.message);
    }

    res.json({
      // Today
      rev_today:      today.rev,
      orders_today:   today.orders,
      sessions_today: sessionsToday,
      sessions_debug: sessionsDebug,
      aov:            today.aov,
      // MTD
      rev_mtd:      mtd.rev,
      return_rate:  mtd.return_rate,
      // Store
      active:  activeCount,
      drafts:  draftCount,
      cvr:     0, // requires Shopify Analytics API (Plus plan)
      // History
      top,
      last7days,
      yesterday: {
        rev_today:    yest.rev,
        orders_today: yest.orders,
        aov:          yest.aov,
        return_rate:  yest.return_rate,
      },
    });
  } catch (e) {
    console.error('[Shopify]', e);
    res.status(500).json({ error: e.message });
  }
};
