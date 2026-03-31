const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '..', 'data', 'google-tokens.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

let oauthClient = null;
let calendarId = null;

function getOAuthClient() {
  if (oauthClient) return oauthClient;
  oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Load saved tokens
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauthClient.setCredentials(tokens);

    // Auto-refresh
    oauthClient.on('tokens', (newTokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      const merged = { ...existing, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
      console.log('[gcal] Tokens refreshed');
    });
  }

  return oauthClient;
}

function getAuthUrl() {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });
}

async function handleCallback(code) {
  const auth = getOAuthClient();
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('[gcal] Tokens saved');

  // Find the "Personal (E+N)" calendar
  await findCalendar();
  return true;
}

function isAuthed() {
  return fs.existsSync(TOKEN_PATH);
}

function getCalendarId() {
  if (calendarId) return calendarId;
  const calIdPath = path.join(__dirname, '..', 'data', 'google-calendar-id.txt');
  if (fs.existsSync(calIdPath)) {
    calendarId = fs.readFileSync(calIdPath, 'utf8').trim();
  }
  return calendarId;
}

async function findCalendar() {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list();
  const match = res.data.items.find(c =>
    c.summary && c.summary.toLowerCase().includes('personal (e+n)')
  );
  if (match) {
    calendarId = match.id;
    const calIdPath = path.join(__dirname, '..', 'data', 'google-calendar-id.txt');
    fs.writeFileSync(calIdPath, calendarId);
    console.log(`[gcal] Found calendar: "${match.summary}" (${calendarId})`);
  } else {
    console.log('[gcal] Could not find "Personal (E+N)" calendar. Available:');
    res.data.items.forEach(c => console.log(`  - ${c.summary} (${c.id})`));
  }
  return calendarId;
}

// Convert our event to Google Calendar event
function toGoogleEvent(event) {
  let description;
  if (event.members && event.members.length > 0) {
    description = 'For: ' + event.members.map(m => `${m.emoji || ''} ${m.name}`).join(', ');
  } else if (event.member_name) {
    description = `For: ${event.member_emoji || ''} ${event.member_name}`;
  }
  const gEvent = {
    summary: `${event.icon || ''} ${event.title}`.trim(),
    description,
  };

  if (event.start_time) {
    gEvent.start = { dateTime: `${event.date}T${event.start_time}:00`, timeZone: 'America/Los_Angeles' };
    gEvent.end = event.end_time
      ? { dateTime: `${event.date}T${event.end_time}:00`, timeZone: 'America/Los_Angeles' }
      : { dateTime: `${event.date}T${event.start_time}:00`, timeZone: 'America/Los_Angeles' };
  } else {
    gEvent.start = { date: event.date };
    gEvent.end = { date: event.date };
  }

  if (event.recurrence) {
    const ruleMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };
    if (ruleMap[event.recurrence]) {
      gEvent.recurrence = [`RRULE:FREQ=${ruleMap[event.recurrence]}`];
    }
  }

  return gEvent;
}

// Push an event to Google Calendar
async function pushEvent(event) {
  const cid = getCalendarId();
  if (!cid || !isAuthed()) return null;

  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const gEvent = toGoogleEvent(event);

  try {
    const res = await calendar.events.insert({ calendarId: cid, requestBody: gEvent });
    console.log(`[gcal] Pushed event: ${event.title} -> ${res.data.id}`);
    return res.data.id;
  } catch (err) {
    console.error(`[gcal] Push failed for "${event.title}":`, err.message);
    return null;
  }
}

// Update an event on Google Calendar
async function updateEvent(googleEventId, event) {
  const cid = getCalendarId();
  if (!cid || !isAuthed() || !googleEventId) return;

  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const gEvent = toGoogleEvent(event);

  try {
    await calendar.events.update({ calendarId: cid, eventId: googleEventId, requestBody: gEvent });
    console.log(`[gcal] Updated event: ${event.title}`);
  } catch (err) {
    console.error(`[gcal] Update failed for "${event.title}":`, err.message);
  }
}

// Delete an event from Google Calendar
async function deleteEvent(googleEventId) {
  const cid = getCalendarId();
  if (!cid || !isAuthed() || !googleEventId) return;

  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    await calendar.events.delete({ calendarId: cid, eventId: googleEventId });
    console.log(`[gcal] Deleted event: ${googleEventId}`);
  } catch (err) {
    console.error(`[gcal] Delete failed:`, err.message);
  }
}

// Pull events from Google Calendar (last 30 days to next 90 days)
async function pullEvents() {
  const cid = getCalendarId();
  if (!cid || !isAuthed()) return [];

  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 90);

  try {
    const res = await calendar.events.list({
      calendarId: cid,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 500,
      orderBy: 'startTime'
    });
    return res.data.items || [];
  } catch (err) {
    console.error('[gcal] Pull failed:', err.message);
    return [];
  }
}

// Format a Date in a specific timezone
function formatInTZ(dt, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(dt);
  const get = type => parts.find(p => p.type === type)?.value || '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`
  };
}

const EVENT_TZ = process.env.EVENT_TIMEZONE || 'America/Los_Angeles';

// Parse a Google Calendar event into our format
function fromGoogleEvent(gEvent) {
  let title = gEvent.summary || 'Untitled';
  let icon = null;

  // Extract leading emoji if present
  const emojiMatch = title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
  if (emojiMatch) {
    icon = emojiMatch[1];
    title = title.slice(emojiMatch[0].length);
  }

  let date, start_time, end_time;
  if (gEvent.start.dateTime) {
    const startDt = new Date(gEvent.start.dateTime);
    const startLocal = formatInTZ(startDt, EVENT_TZ);
    date = startLocal.date;
    start_time = startLocal.time;
    if (gEvent.end.dateTime) {
      const endLocal = formatInTZ(new Date(gEvent.end.dateTime), EVENT_TZ);
      end_time = endLocal.time;
    }
  } else {
    date = gEvent.start.date;
  }

  return {
    title,
    icon: icon || '📅',
    date,
    start_time: start_time || null,
    end_time: end_time || null,
    google_event_id: gEvent.id,
    recurrence: null,
    member_id: null,
    notes: gEvent.description || null
  };
}

// Full sync: pull from Google, merge with local DB
async function syncFromGoogle(db, saveDb) {
  if (!isAuthed() || !getCalendarId()) return { added: 0, updated: 0 };

  const gEvents = await pullEvents();
  if (gEvents.length === 0) return { added: 0, updated: 0 };

  const { queryAll, queryOne, run: dbRun } = require('../db/helpers');
  let added = 0, updated = 0;

  for (const gEvent of gEvents) {
    if (gEvent.status === 'cancelled') continue;

    const parsed = fromGoogleEvent(gEvent);
    const existing = queryOne(db, 'SELECT * FROM events WHERE google_event_id = ?', [gEvent.id]);

    if (existing) {
      // Update if Google version is newer
      const gUpdated = new Date(gEvent.updated).getTime();
      const localUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      if (gUpdated > localUpdated) {
        db.run(
          `UPDATE events SET title=?, icon=?, date=?, start_time=?, end_time=?, notes=?, updated_at=datetime('now') WHERE id=?`,
          [parsed.title, parsed.icon, parsed.date, parsed.start_time, parsed.end_time, parsed.notes, existing.id]
        );
        updated++;
      }
    } else {
      // New event from Google — insert it
      db.run(
        `INSERT INTO events (title, icon, date, start_time, end_time, member_id, recurrence, notes, google_event_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [parsed.title, parsed.icon, parsed.date, parsed.start_time, parsed.end_time, null, null, parsed.notes, gEvent.id]
      );
      added++;
    }
  }

  // Check for deletions: local events with google_event_id not in pulled set
  const googleIds = new Set(gEvents.map(e => e.id));
  const localWithGoogleId = queryAll(db, 'SELECT id, google_event_id FROM events WHERE google_event_id IS NOT NULL');
  let deleted = 0;
  for (const local of localWithGoogleId) {
    if (!googleIds.has(local.google_event_id)) {
      db.run('DELETE FROM events WHERE id = ?', [local.id]);
      deleted++;
    }
  }

  if (added || updated || deleted) {
    saveDb();
    console.log(`[gcal] Sync: ${added} added, ${updated} updated, ${deleted} deleted`);
  }

  return { added, updated, deleted };
}

// Initial push: push all existing local events that don't have a google_event_id
async function pushAllEvents(db, saveDb) {
  if (!isAuthed() || !getCalendarId()) return;

  const { queryAll } = require('../db/helpers');
  const events = queryAll(db, 'SELECT * FROM events WHERE google_event_id IS NULL');
  // Attach members from junction table
  const allEM = queryAll(db,
    `SELECT em.event_id, f.id, f.name, f.emoji
     FROM event_members em JOIN family_members f ON em.member_id = f.id`
  );
  const memberMap = {};
  for (const row of allEM) {
    if (!memberMap[row.event_id]) memberMap[row.event_id] = [];
    memberMap[row.event_id].push({ id: row.id, name: row.name, emoji: row.emoji });
  }
  for (const e of events) {
    e.members = memberMap[e.id] || [];
  }

  for (const event of events) {
    const googleId = await pushEvent(event);
    if (googleId) {
      db.run('UPDATE events SET google_event_id = ? WHERE id = ?', [googleId, event.id]);
    }
  }
  if (events.length > 0) {
    saveDb();
    console.log(`[gcal] Pushed ${events.length} existing events to Google`);
  }
}

module.exports = {
  getOAuthClient, getAuthUrl, handleCallback, isAuthed,
  getCalendarId, findCalendar,
  pushEvent, updateEvent, deleteEvent,
  pullEvents, syncFromGoogle, pushAllEvents,
  toGoogleEvent, fromGoogleEvent
};
