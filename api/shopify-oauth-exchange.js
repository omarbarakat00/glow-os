export default async function handler(req, res) {
  const { code, shop } = req.query;
  if (!code) return res.status(400).json({ error: 'no code' });
  const r = await fetch('https://' + (shop || '84e04c-2.myshopify.com') + '/admin/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code
    })
  });
  const data = await r.json();
  res.setHeader('Content-Type', 'text/plain');
  res.end('TOKEN: ' + JSON.stringify(data));
}
