export default async function handler(req, res) {
  const { code, shop } = req.query;
  if (!code || !shop) {
    res.status(400).send('Missing code or shop');
    return;
  }
  try {
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'cc150caf8ab17a60a750a68b56534315',
        client_secret: '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',
        code
      })
    });
    const data = await r.json();
    if (data.access_token) {
      res.send('<h2>New Token</h2><p>Token: ' + data.access_token + '</p><p>Scope: ' + data.scope + '</p>');
    } else {
      res.status(400).json(data);
    }
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
}
