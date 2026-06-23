// api/calendar.js
// Vercel serverless function — reads today's Google Calendar events
//
// Env vars required:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — same service account used for Sheets
//   GOOGLE_PRIVATE_KEY            — same private key
//   GOOGLE_CALENDAR_ID            — your calendar ID (usually your Gmail address,
//                                   or find it in Google Calendar settings → "Calendar ID")
//
// IMPORTANT: Share your Google Calendar with the service account email address.
//   Google Calendar → Settings → [Your calendar] → "Share with specific people"
//   → Add service account email with "See all event details" permission.

const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const EMAIL    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const RAW_KEY  = process.env.GOOGLE_PRIVATE_KEY || '';
  const CAL_ID   = process.env.GOOGLE_CALENDAR_ID;

  if (!EMAIL || !RAW_KEY || !CAL_ID) {
    return res.status(500).json({
      error: 'Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_CALENDAR_ID in Vercel env vars.',
    });
  }

  const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n');

  // Cairo is UTC+2 (no DST since 2011)
  const CAIRO_MS = 2 * 60 * 60 * 1000;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Compute start/end of today in Cairo time, expressed as UTC
    const now = new Date();
    const cairoNow = new Date(now.getTime() + CAIRO_MS);
    const y  = cairoNow.getUTCFullYear();
    const mo = cairoNow.getUTCMonth();
    const d  = cairoNow.getUTCDate();

    const startOfDay = new Date(Date.UTC(y, mo, d,  0,  0,  0) - CAIRO_MS);
    const endOfDay   = new Date(Date.UTC(y, mo, d, 23, 59, 59) - CAIRO_MS);

    const response = await calendar.events.list({
      calendarId:   CAL_ID,
      timeMin:      startOfDay.toISOString(),
      timeMax:      endOfDay.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   25,
    });

    const events = (response.data.items || []).map(e => {
      // Show time in Cairo timezone
      const startDT = e.start?.dateTime;
      const time = startDT
        ? new Date(startDT).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo',
          })
        : 'All day';
      return {
        time,
        title: e.summary   || 'Untitled',
        desc:  e.description || e.location || '',
      };
    });

    res.json({
      events,
      summary: events.length > 0
        ? `${events.length} event${events.length !== 1 ? 's' : ''} today`
        : 'No events today',
    });
  } catch (e) {
    console.error('[Calendar]', e);
    res.status(500).json({ error: e.message });
  }
};
