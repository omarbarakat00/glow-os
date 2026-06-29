module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const QUERY = JSON.stringify({ query: '{ shopifyqlQuery(query: "FROM sessions SHOW sessions SINCE today UNTIL today") { tableData { rows } parseErrors } }' });
  const versions = ['2022-10', '2023-01', '2023-10', '2024-01', '2024-04', '2024-07', '2024-10', '2025-01', '2025-04'];
  const results = {};
  for (const v of versions) {
    try {
      const r = await fetch(`https://${STORE}/admin/api/${v}/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
        body: QUERY
      });
      const d = await r.json();
      if (d.errors) results[v] = 'ERR: ' + d.errors[0].message.substring(0, 60);
      else results[v] = 'OK rows=' + JSON.stringify(d?.data?.shopifyqlQuery?.tableData?.rows);
    } catch(e) { results[v] = 'THROW: ' + e.message.substring(0, 40); }
  }
  res.json(results);
};
