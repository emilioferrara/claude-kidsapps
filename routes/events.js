const express = require('express');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db/helpers');
const gcal = require('../lib/gcal');

// Helper: attach members array to events
function attachMembers(db, events) {
  if (events.length === 0) return events;
  const allEM = queryAll(db,
    `SELECT em.event_id, f.id, f.name, f.color, f.emoji
     FROM event_members em JOIN family_members f ON em.member_id = f.id`
  );
  const memberMap = {};
  for (const row of allEM) {
    if (!memberMap[row.event_id]) memberMap[row.event_id] = [];
    memberMap[row.event_id].push({ id: row.id, name: row.name, color: row.color, emoji: row.emoji });
  }
  for (const e of events) {
    e.members = memberMap[e.id] || [];
    e.member_ids = e.members.map(m => m.id);
    // Backward compat
    if (e.members.length > 0) {
      e.member_id = e.members[0].id;
      e.member_name = e.members.map(m => m.name).join(', ');
      e.member_color = e.members[0].color;
      e.member_emoji = e.members.map(m => m.emoji).join('');
    } else {
      e.member_id = null;
      e.member_name = null;
      e.member_color = null;
      e.member_emoji = null;
    }
  }
  return events;
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { month, date } = req.query;

  const allEvents = queryAll(db, 'SELECT * FROM events ORDER BY date, start_time');
  attachMembers(db, allEvents);

  let rangeStart, rangeEnd;
  if (date) {
    rangeStart = date;
    rangeEnd = date;
  } else if (month) {
    const [y, m] = month.split('-').map(Number);
    rangeStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    rangeEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    res.json(allEvents.filter(e => !e.recurrence).slice(0, 100));
    return;
  }

  const results = [];
  for (const event of allEvents) {
    if (!event.recurrence) {
      if (event.date >= rangeStart && event.date <= rangeEnd) {
        results.push(event);
      }
      continue;
    }
    const eventDate = new Date(event.date + 'T12:00:00');
    const start = new Date(rangeStart + 'T12:00:00');
    const end = new Date(rangeEnd + 'T12:00:00');

    let cursor = new Date(eventDate);
    while (cursor < start) {
      advanceCursor(cursor, event.recurrence);
    }
    while (cursor <= end) {
      const dateStr = cursor.toISOString().split('T')[0];
      if (dateStr >= event.date) {
        results.push({ ...event, date: dateStr });
      }
      advanceCursor(cursor, event.recurrence);
    }
  }

  results.sort((a, b) => (a.date + (a.start_time || '')) > (b.date + (b.start_time || '')) ? 1 : -1);
  res.json(results);
});

function advanceCursor(cursor, recurrence) {
  switch (recurrence) {
    case 'daily': cursor.setDate(cursor.getDate() + 1); break;
    case 'weekly': cursor.setDate(cursor.getDate() + 7); break;
    case 'monthly': cursor.setMonth(cursor.getMonth() + 1); break;
    default: cursor.setFullYear(9999);
  }
}

router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, date, start_time, end_time, member_ids, member_id, recurrence, notes } = req.body;
  const result = run(db, `
    INSERT INTO events (title, icon, date, start_time, end_time, recurrence, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [title, icon || null, date, start_time || null, end_time || null, recurrence || null, notes || null]);

  // Insert member associations
  const ids = member_ids || (member_id ? [member_id] : []);
  for (const mid of ids) {
    run(db, 'INSERT INTO event_members (event_id, member_id) VALUES (?, ?)', [result.lastInsertRowid, mid]);
  }
  req.app.locals.saveDb();

  // Build event object with members for gcal push
  const members = ids.length > 0
    ? queryAll(db, `SELECT id, name, color, emoji FROM family_members WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : [];
  const newEvent = { id: result.lastInsertRowid, ...req.body, members };

  gcal.pushEvent(newEvent).then(googleId => {
    if (googleId) {
      db.run('UPDATE events SET google_event_id = ? WHERE id = ?', [googleId, newEvent.id]);
      req.app.locals.saveDb();
    }
  }).catch(err => console.error('[gcal] push error:', err.message));

  res.json(newEvent);
});

router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, date, start_time, end_time, member_ids, member_id, recurrence, notes } = req.body;
  const eventId = parseInt(req.params.id);
  const existing = queryOne(db, 'SELECT google_event_id FROM events WHERE id = ?', [eventId]);

  run(db, `UPDATE events SET title=?, icon=?, date=?, start_time=?, end_time=?, recurrence=?, notes=?, updated_at=datetime('now') WHERE id=?`,
    [title, icon || null, date, start_time || null, end_time || null, recurrence || null, notes || null, eventId]);

  // Update member associations
  db.run('DELETE FROM event_members WHERE event_id = ?', [eventId]);
  const ids = member_ids || (member_id ? [member_id] : []);
  for (const mid of ids) {
    run(db, 'INSERT INTO event_members (event_id, member_id) VALUES (?, ?)', [eventId, mid]);
  }
  req.app.locals.saveDb();

  if (existing && existing.google_event_id) {
    const members = ids.length > 0
      ? queryAll(db, `SELECT id, name, emoji FROM family_members WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      : [];
    gcal.updateEvent(existing.google_event_id, { ...req.body, members }).catch(err => console.error('[gcal] update error:', err.message));
  }

  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const eventId = parseInt(req.params.id);
  const existing = queryOne(db, 'SELECT google_event_id FROM events WHERE id = ?', [eventId]);
  run(db, 'DELETE FROM events WHERE id = ?', [eventId]);
  // event_members cleaned up by ON DELETE CASCADE
  req.app.locals.saveDb();

  if (existing && existing.google_event_id) {
    gcal.deleteEvent(existing.google_event_id).catch(err => console.error('[gcal] delete error:', err.message));
  }

  res.json({ success: true });
});

module.exports = router;
