module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const STORE = process.env.SHOPIFY_STORE;
  const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  // Check actual scopes
  const scopeR = await fetch(`https://${STORE}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  });
  const scopeD = await scopeR.json();
  // Quick GQL test with latest version
  const gqlR = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ shopifyqlQuery(query: "FROM sessions SHOW sessions SINCE today UNTIL today") { tableData { rows } } }' })
  });
  const gqlD = await gqlR.json();
  res.json({ token_prefix: TOKEN.substring(0,12), scopes: scopeD.access_scopes?.map(s=>s.handle), gql_error: gqlD.errors?.[0]?.message, gql_rows: gqlD?.data?.shopifyqlQuery?.tableData?.rows });
};
