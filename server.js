const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { initDatabase } = require('./db/init');
const gcal = require('./lib/gcal');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'calendar.db');

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
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes
  app.use('/api/family', require('./routes/family'));
  app.use('/api/events', require('./routes/events'));
  app.use('/api/chores', require('./routes/chores'));
  app.use('/api/weather', require('./routes/weather'));
  app.use('/auth', require('./routes/auth'));

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
