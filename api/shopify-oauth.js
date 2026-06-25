export default async function handler(req, res) {
  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const tokenPreview = TOKEN ? TOKEN.slice(0, 12) + '...' : 'NOT SET';
  
  // Check scopes via Shopify OAuth scopes endpoint
  let scopes = null;
  let gqlTest = null;
  try {
    const r = await fetch(`https://${STORE}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': TOKEN }
    });
    const d = await r.json();
    scopes = d.access_scopes?.map(s => s.handle) || d;
  } catch(e) { scopes = { error: e.message }; }
  
  // Try shopifyqlQuery
  try {
    const r = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ shopifyqlQuery(query: "FROM sessions SHOW sessions SINCE today UNTIL today") { tableData { rows } parseErrors } }' })
    });
    const d = await r.json();
    gqlTest = { status: r.status, errors: d.errors, rows: d?.data?.shopifyqlQuery?.tableData?.rows?.slice(0,1) };
  } catch(e) { gqlTest = { error: e.message }; }
  
  res.json({ store: STORE, token: tokenPreview, scopes, gqlTest });
}
