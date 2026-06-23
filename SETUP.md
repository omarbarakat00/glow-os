# Glow OS — Setup Guide

This dashboard pulls **real** data from Shopify, Meta Ads, Google Sheets, and Google Calendar.
All API credentials live in Vercel as environment variables — never in the code.

---

## Step 1 — Deploy to Vercel

1. Push this repo to GitHub (replace your existing `glow-os` repo contents).
2. Go to [vercel.com](https://vercel.com) → New Project → Import your `glow-os` GitHub repo.
3. Leave all build settings as default (Vercel auto-detects the `api/` folder).
4. Click **Deploy**. The site will be live at `https://glow-os.vercel.app` (or a custom domain).

You will add all environment variables in Step 5 — the site will show errors until then.

---

## Step 2 — Shopify API Token

1. In your Shopify Admin: **Settings → Apps and sales channels → Develop apps**.
2. Click **Create an app** → name it "Glow OS Dashboard".
3. Under **Configuration → Admin API access scopes**, enable:
   - `read_orders`
   - `read_products`
4. Click **Install app** → copy the **Admin API access token** (starts with `shpat_`).

**Env vars to add:**
```
SHOPIFY_STORE        = glowmodest.myshopify.com
SHOPIFY_ACCESS_TOKEN = shpat_xxxxxxxxxxxxxxxxxxxx
```

---

## Step 3 — Meta Marketing API Token

You need a long-lived user access token with `ads_read` permission.

**Quick way (personal dashboard):**
1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer).
2. Select your Meta App → click **Generate Access Token**.
3. Add permissions: `ads_read`, `ads_management`.
4. Copy the token, then extend it to 60 days at:
   `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN`

**Env vars to add:**
```
META_ACCESS_TOKEN   = EAAxxxxxxxxxxxxxxx
META_AD_ACCOUNT_ID  = 1524022621557206
```

> Note: 60-day tokens expire. For a permanent solution, set up a system user in Business Manager with a permanent token.

---

## Step 4 — Google Sheets + Calendar (Service Account)

### 4a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project: "Glow OS".
3. Enable these APIs (search in the API Library):
   - **Google Sheets API**
   - **Google Calendar API**

### 4b. Create a Service Account

1. Go to **IAM & Admin → Service Accounts → Create Service Account**.
2. Name: "glow-os-dashboard" → click **Create**.
3. Skip role assignment → click **Done**.
4. Click on the service account → **Keys → Add Key → Create new key → JSON**.
5. Download the JSON file. You need two values from it:
   - `client_email` → e.g. `glow-os-dashboard@glow-os.iam.gserviceaccount.com`
   - `private_key`  → the long `-----BEGIN RSA PRIVATE KEY-----...` block

### 4c. Share your Google Sheet

1. Open your CFO Sheet / Cash Master spreadsheet.
2. Click **Share** → paste the service account email → set to **Viewer** → Share.
3. Copy the spreadsheet ID from the URL:
   `docs.google.com/spreadsheets/d/**THIS_PART**/edit`

### 4d. Share your Google Calendar

1. Open [calendar.google.com](https://calendar.google.com) → Settings (gear icon).
2. Click your calendar name under "My calendars".
3. Under "Share with specific people", add the service account email → "See all event details".
4. Your Calendar ID is shown under "Integrate calendar" — it looks like your Gmail address.

### 4e. Configure cell ranges

Open `api/sheets.js` and update the default cell ranges to match where your numbers actually live in the CFO Sheet. Example:

```js
const ranges = {
  profit:  'CEO Dashboard!B2',   // Net profit EGP
  cash:    'Cash Master!B2',     // Cash position
  float:   'Cash Master!B3',     // COD float
  adspend: 'CEO Dashboard!B5',   // Total ad spend
  cogs:    'CEO Dashboard!B6',   // COGS ratio (0.38 or 38%)
  margin:  'CEO Dashboard!B7',   // Gross margin (0.62 or 62%)
};
```

Or set them as Vercel env vars (see below) to avoid editing code.

**Env vars to add:**
```
GOOGLE_SERVICE_ACCOUNT_EMAIL = glow-os-dashboard@glow-os.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY           = -----BEGIN RSA PRIVATE KEY-----\nMIIEow...
GOOGLE_SHEETS_CFO_ID         = 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_CALENDAR_ID           = omar@example.com

# Optional — override default cell ranges:
SHEETS_RANGE_PROFIT          = CEO Dashboard!B2
SHEETS_RANGE_CASH            = Cash Master!B2
SHEETS_RANGE_FLOAT           = Cash Master!B3
SHEETS_RANGE_ADSPEND         = CEO Dashboard!B5
SHEETS_RANGE_COGS            = CEO Dashboard!B6
SHEETS_RANGE_MARGIN          = CEO Dashboard!B7
```

> For the private key in Vercel: paste the full key including the `-----BEGIN...` and `-----END...` lines. Vercel stores newlines as `\n` automatically.

---

## Step 5 — Add all env vars to Vercel

1. In Vercel dashboard → your project → **Settings → Environment Variables**.
2. Add each variable above one by one.
3. Also add your Anthropic key for the AI briefing:
   ```
   ANTHROPIC_API_KEY = sk-ant-api03-xxxxxxxxxxxx
   ```
4. After adding all vars, go to **Deployments → Redeploy** (the vars only take effect on new deploys).

---

## Step 6 — Verify

Open your Vercel URL, click **Refresh**, and check each section. If something shows an error banner, the error message will tell you exactly which env var is missing or wrong.

**Common issues:**
- `Shopify 401` → wrong access token or wrong store domain
- `Meta API: Invalid OAuth token` → token expired or wrong permissions
- `Google Sheets: PERMISSION_DENIED` → sheet not shared with service account email
- `Google Calendar: PERMISSION_DENIED` → calendar not shared with service account email

---

## File structure

```
glow-os/
├── index.html          ← frontend (no credentials, calls /api/*)
├── package.json        ← googleapis dependency
├── vercel.json         ← serverless function config
├── api/
│   ├── shopify.js      ← Shopify Admin API proxy
│   ├── meta.js         ← Meta Marketing API proxy
│   ├── sheets.js       ← Google Sheets proxy
│   ├── calendar.js     ← Google Calendar proxy
│   └── briefing.js     ← AI briefing (server-side Anthropic call)
└── SETUP.md            ← this file
```
