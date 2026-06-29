// api/shopify.js — Vercel serverless proxy for Shopify Admin API
// Env vars: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!STORE || !TOKEN) return res.status(500).json({ error: 'Missing env vars' });

  const BASE  = `https://${STORE}/admin/api/2025-01`;
  const HDRS  = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };
  const CAIRO = 3 * 60 * 60 * 1000; // UTC+3

  function cairoDateKey(utcMs) {
    return new Date(utcMs + CAIRO).toISOString().slice(0, 10);
  }
  function cairoMidnightUTC(dateKey) {
    return new Date(dateKey + 'T00:00:00Z').getTime() - CAIRO;
  }

  async function shopifyGET(path) {
    const r = await fetch(`${BASE}${path}`, { headers: HDRS });
    const data = await r.json();
    if (!r.ok) throw new Error(`Shopify ${r.status}: ${JSON.stringify(data.errors || {})}`);
    return data;
  }

  // Fetch all orders since sinceISO with pagination (max 10 pages = 2500 orders)
  async function fetchOrders(sinceISO, fields) {
    let orders = [], pages = 0;
    let url = `${BASE}/orders.json?status=any&created_at_min=${sinceISO}&limit=250&fields=${fields}`;
    while (url && pages < 10) {
      const r = await fetch(url, { headers: HDRS });
      if (!r.ok) throw new Error(`Orders ${r.status}`);
      const data = await r.json();
      orders = orders.concat(data.orders || []);
      pages++;
      const link = r.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
    return orders;
  }

  function calcMetrics(orders) {
    const active = orders.filter(o => !o.cancelled_at);
    const rev    = active.reduce((s, o) => s + parseFloat(o.subtotal_price || o.total_price || 0), 0);
    const refs   = active.filter(o => o.refunds && o.refunds.length > 0).length;
    return {
      rev:         Math.round(rev),
      orders:      orders.length,
      aov:         active.length > 0 ? Math.round(rev / active.length) : 0,
      return_rate: active.length > 0 ? parseFloat((refs / active.length).toFixed(3)) : 0,
    };
  }

  try {
    const now      = Date.now();
    const todayKey = cairoDateKey(now);
    const todayStart = cairoMidnightUTC(todayKey);
    const yestStart  = todayStart - 86400000;
    const [y, m]     = todayKey.split('-');
    const monthStart = cairoMidnightUTC(`${y}-${m}-01`);
    const day30Ago   = todayStart - 30 * 86400000;
    const fetchSince = new Date(Math.min(monthStart, day30Ago)).toISOString();
    const FIELDS     = 'id,total_price,subtotal_price,line_items,created_at,cancelled_at,refunds';

    // Fetch orders + product counts in parallel
    const [allOrders, activeCount, draftCount] = await Promise.all([
      fetchOrders(fetchSince, FIELDS),
      shopifyGET('/products/count.json?status=active').then(d => d.count || 0),
      shopifyGET('/products/count.json?status=draft').then(d => d.count || 0),
    ]);

    // Partition into time windows
    const todayOrders = allOrders.filter(o => new Date(o.created_at).getTime() >= todayStart);
    const yestOrders  = allOrders.filter(o => {
      const t = new Date(o.created_at).getTime();
      return t >= yestStart && t < todayStart;
    });
    const mtdOrders   = allOrders.filter(o => new Date(o.created_at).getTime() >= monthStart);
    const last30      = allOrders.filter(o => new Date(o.created_at).getTime() >= day30Ago);

    // 7-day revenue chart
    const last7days = [];
    for (let i = 6; i >= 0; i--) {
      const ds = todayStart - i * 86400000;
      const de = ds + 86400000;
      const dk = cairoDateKey(ds + CAIRO);
      const rev = allOrders
        .filter(o => { const t = new Date(o.created_at).getTime(); return t >= ds && t < de && !o.cancelled_at; })
        .reduce((s, o) => s + parseFloat(o.subtotal_price || o.total_price || 0), 0);
      last7days.push({ date: dk, rev: Math.round(rev) });
    }

    // Top products last 30 days by revenue
    const prodMap = {};
    for (const o of last30) {
      if (o.cancelled_at) continue;
      for (const item of o.line_items || []) {
        const k = item.title || 'Unknown';
        if (!prodMap[k]) prodMap[k] = { name: k, rev: 0, orders: 0 };
        prodMap[k].rev    += parseFloat(item.price || 0) * (item.quantity || 1);
        prodMap[k].orders += item.quantity || 1;
      }
    }
    const top = Object.values(prodMap)
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 10)
      .map(p => ({ name: p.name, rev: Math.round(p.rev), orders: p.orders, net: Math.round(p.rev * 0.62) }));

    const today = calcMetrics(todayOrders);
    const yest  = calcMetrics(yestOrders);
    const mtd   = calcMetrics(mtdOrders);

    // Sessions: use Clarity API (see /api/clarity) — not available via Shopify Basic plan
    const sessionsToday = 0;

    return res.json({
      rev_today:      today.rev,
      orders_today:   today.orders,
      sessions_today: sessionsToday,
      aov:            today.aov,
      rev_mtd:        mtd.rev,
      return_rate:    mtd.return_rate,
      active:         activeCount,
      drafts:         draftCount,
      cvr:            0,
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
    console.error('[Shopify]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
