module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const PROJECT_ID = process.env.CLARITY_PROJECT_ID;
  const TOKEN = process.env.CLARITY_TOKEN;

  if (!PROJECT_ID || !TOKEN) {
    return res.status(500).json({ error: 'Missing Clarity env vars' });
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startDate = todayStr + 'T00:00:00Z';
  const endDate = todayStr + 'T23:59:59Z';

  try {
    const url = `https://www.clarity.ms/export/api/v1/${PROJECT_ID}/metrics?startDate=${startDate}&endDate=${endDate}`;
    
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json'
      }
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw_text: text.substring(0, 500) }; }

    if (!r.ok) {
      const url2 = `https://www.clarity.ms/api/v1/${PROJECT_ID}/dashboard?startDate=${startDate}&endDate=${endDate}`;
      const r2 = await fetch(url2, {
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
      });
      const text2 = await r2.text();
      let data2;
      try { data2 = JSON.parse(text2); } catch(e) { data2 = { raw_text: text2.substring(0, 500) }; }
      return res.json({ endpoint: 'v1-dashboard', status: r2.status, data: data2, fallback_status: r.status, fallback_snippet: text.substring(0,200) });
    }

    let sessionsToday = 0;
    if (Array.isArray(data)) {
      const m = data.find(x => /session/i.test(x.metric || x.name || x.metricName || ''));
      if (m) sessionsToday = parseInt(m.value || m.count || 0);
    } else if (data && typeof data === 'object') {
      sessionsToday = parseInt(data.sessions || data.Sessions || data.totalSessions || data.TotalSessions || 0);
    }

    return res.json({ sessions_today: sessionsToday, date: todayStr, raw: data });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
