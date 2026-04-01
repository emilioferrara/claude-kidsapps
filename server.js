const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { initDatabase } = require('./db/init');
const gcal = require('./lib/gcal');

const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'calendar.db');
const FAMILY_PIN = process.env.FAMILY_PIN || '0000';
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

async function start() {
  const SQL = await initSqlJs();

  // Load existing db or create new
  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  initDatabase(db);
  saveDb(db);

  // Make db available to routes
  app.locals.db = db;
  app.locals.saveDb = () => saveDb(db);

  // Middleware
  app.use(express.json());

  // PIN auth helpers
  function makeToken() {
    return crypto.createHmac('sha256', AUTH_SECRET).update(FAMILY_PIN).digest('hex');
  }
  function parseCookies(req) {
    const obj = {};
    (req.headers.cookie || '').split(';').forEach(c => {
      const [k, v] = c.trim().split('=');
      if (k) obj[k] = v;
    });
    return obj;
  }
  function isAuthed(req) {
    return parseCookies(req).family_auth === makeToken();
  }

  // PIN login endpoint (no auth required)
  app.post('/auth/pin', (req, res) => {
    if (req.body.pin === FAMILY_PIN) {
      res.setHeader('Set-Cookie', `family_auth=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${365 * 24 * 60 * 60}`);
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Wrong PIN' });
    }
  });

  // Login page (no auth required)
  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  // Google OAuth callback (no auth required)
  app.use('/auth', require('./routes/auth'));

  // Protect everything else
  app.use((req, res, next) => {
    if (isAuthed(req)) return next();
    // API requests get 401, browser requests get redirected
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
    res.redirect('/login');
  });

  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes
  app.use('/api/family', require('./routes/family'));
  app.use('/api/events', require('./routes/events'));
  app.use('/api/chores', require('./routes/chores'));
  app.use('/api/weather', require('./routes/weather'));

  // Google Calendar sync every 5 minutes
  if (gcal.isAuthed()) {
    console.log('Google Calendar connected — starting sync');
    const runSync = () => gcal.syncFromGoogle(db, () => saveDb(db)).catch(err => console.error('[gcal] sync error:', err.message));
    runSync(); // initial sync on startup
    setInterval(runSync, 5 * 60 * 1000);
  } else {
    console.log('Google Calendar not connected — visit /auth/google to connect');
  }

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Family Calendar running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    saveDb(db);
    db.close();
    process.exit(0);
  });
}

function saveDb(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

start().catch(console.error);
