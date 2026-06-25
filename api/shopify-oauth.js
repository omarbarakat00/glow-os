export default async function handler(req, res) {
  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const versions = ['2024-07', '2024-10', '2025-01', '2025-04'];
  const results = {};
  for (const v of versions) {
    try {
      const r = await fetch(`https://${STORE}/admin/api/${v}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ shopifyqlQuery(query: "FROM sessions SHOW sessions SINCE today UNTIL today") { tableData { rows } parseErrors } }' })
      });
      const d = await r.json();
      results[v] = d.errors ? 'ERROR: ' + d.errors[0].message.slice(0, 60) : 'OK rows=' + JSON.stringify(d?.data?.shopifyqlQuery?.tableData?.rows);
    } catch(e) { results[v] = 'THROW: ' + e.message.slice(0, 60); }
  }
  res.json(results);
}
