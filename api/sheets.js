// api/sheets.js
// Vercel serverless function — reads your CFO Sheet via Google Sheets API
//
// Env vars required:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email (e.g. glow-os@project.iam.gserviceaccount.com)
//   GOOGLE_PRIVATE_KEY            — service account private key (paste the full -----BEGIN... block)
//   GOOGLE_SHEETS_CFO_ID          — the spreadsheet ID from the URL:
//                                   docs.google.com/spreadsheets/d/<THIS_PART>/edit
//
// Cell range env vars (optional — update defaults below to match your sheet):
//   SHEETS_RANGE_PROFIT   e.g. "CEO Dashboard!B2"
//   SHEETS_RANGE_CASH     e.g. "Cash Master!B2"
//   SHEETS_RANGE_FLOAT    e.g. "Cash Master!B3"
//   SHEETS_RANGE_ADSPEND  e.g. "CEO Dashboard!B5"
//   SHEETS_RANGE_COGS     e.g. "CEO Dashboard!B6"
//   SHEETS_RANGE_MARGIN   e.g. "CEO Dashboard!B7"

const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEETS_ID = process.env.GOOGLE_SHEETS_CFO_ID;
  const EMAIL     = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const RAW_KEY   = process.env.GOOGLE_PRIVATE_KEY || '';

  if (!SHEETS_ID || !EMAIL || !RAW_KEY) {
    return res.status(500).json({
      error: 'Set GOOGLE_SHEETS_CFO_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY in Vercel env vars.',
    });
  }

  // Vercel stores newlines as literal \n in env vars — convert them back
  const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n');

  // Cell ranges — update these to match your actual sheet/tab names and cells
  const ranges = {
    profit:  process.env.SHEETS_RANGE_PROFIT  || 'CEO Dashboard!B2',
    cash:    process.env.SHEETS_RANGE_CASH    || 'Cash Master!B2',
    float:   process.env.SHEETS_RANGE_FLOAT   || 'Cash Master!B3',
    adspend: process.env.SHEETS_RANGE_ADSPEND || 'CEO Dashboard!B5',
    cogs:    process.env.SHEETS_RANGE_COGS    || 'CEO Dashboard!B6',
    margin:  process.env.SHEETS_RANGE_MARGIN  || 'CEO Dashboard!B7',
  };

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEETS_ID,
      ranges: Object.values(ranges),
    });

    const vals = response.data.valueRanges || [];

    // Parse a cell value — strips currency symbols/commas, returns number
    function cell(i) {
      const raw = vals[i]?.values?.[0]?.[0];
      if (raw === undefined || raw === null || raw === '') return 0;
      const num = parseFloat(raw.toString().replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? 0 : num;
    }

    // Normalise a value that might be stored as percentage (38 or 38%) or decimal (0.38)
    function pct(i) {
      const v = cell(i);
      return v > 1 ? v / 100 : v;
    }

    res.json({
      profit:  cell(0),
      cash:    cell(1),
      float:   cell(2),
      adspend: cell(3),
      cogs:    pct(4),
      margin:  pct(5),
    });
  } catch (e) {
    console.error('[Sheets]', e);
    res.status(500).json({ error: e.message });
  }
};
