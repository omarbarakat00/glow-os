// In-memory cache to stay within Clarity's 10 req/day limit
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const TOKEN = process.env.CLARITY_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'Missing CLARITY_TOKEN' });

  const now = Date.now();
  if (_cache !== null && (now - _cacheTime) < CACHE_TTL) {
    return res.json({ sessions_today: _cache, cached: true, cache_age_min: Math.round((now - _cacheTime) / 60000) });
  }

  try {
    // Clarity Data Export API - last 24h, no dimension (overall total)
    const url = 'https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1';
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: 'Clarity API error', status: r.status, detail: errText.substring(0, 300) });
    }

    const data = await r.json();

    // Traffic metric contains totalSessionCount and totalBotSessionCount per row
    // Sum real (non-bot) sessions across all rows
    let sessionsTotal = 0;
    if (Array.isArray(data)) {
      const traffic = data.find(m => m.metricName === 'Traffic');
      if (traffic && Array.isArray(traffic.information)) {
        sessionsTotal = traffic.information.reduce((sum, row) => {
          const total = parseInt(row.totalSessionCount || 0);
          const bots = parseInt(row.totalBotSessionCount || 0);
          return sum + Math.max(0, total - bots);
        }, 0);
      }
    }

    _cache = sessionsTotal;
    _cacheTime = now;

    return res.json({ sessions_today: sessionsTotal, cached: false, raw_count: data?.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
