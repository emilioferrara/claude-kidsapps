const express = require('express');
const router = express.Router();
const gcal = require('../lib/gcal');

// Redirect to Google OAuth
router.get('/google', (req, res) => {
  res.redirect(gcal.getAuthUrl());
});

// OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing auth code');

  try {
    await gcal.handleCallback(code);

    // Push existing events to Google
    const db = req.app.locals.db;
    const saveDb = req.app.locals.saveDb;
    await gcal.pushAllEvents(db, saveDb);

    res.send(`
      <html><body style="font-family:Poppins,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8f9fa">
        <div style="text-align:center">
          <h1>Connected!</h1>
          <p>Google Calendar is now synced with your Family Calendar.</p>
          <p>All existing events have been pushed to Google.</p>
          <a href="/" style="color:#6C5CE7;font-weight:600">Back to Calendar</a>
        </div>
      </body></html>
    `);
  } catch (err) {
    console.error('[auth] Google callback error:', err);
    res.status(500).send('Auth failed: ' + err.message);
  }
});

// Status check
router.get('/status', (req, res) => {
  res.json({
    google_connected: gcal.isAuthed(),
    calendar_id: gcal.getCalendarId() || null
  });
});

// Manual sync trigger
router.post('/sync', async (req, res) => {
  const db = req.app.locals.db;
  const saveDb = req.app.locals.saveDb;
  try {
    const result = await gcal.syncFromGoogle(db, saveDb);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
