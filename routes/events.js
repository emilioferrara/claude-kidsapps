const express = require('express');
const router = express.Router();
const { queryAll, run } = require('../db/helpers');

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { month, date } = req.query;

  const baseQuery = `
    SELECT e.*, f.name as member_name, f.color as member_color, f.emoji as member_emoji
    FROM events e
    LEFT JOIN family_members f ON e.member_id = f.id`;

  const allEvents = queryAll(db, `${baseQuery} ORDER BY e.date, e.start_time`);

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
    // Expand recurring events into the requested range
    const eventDate = new Date(event.date + 'T12:00:00');
    const start = new Date(rangeStart + 'T12:00:00');
    const end = new Date(rangeEnd + 'T12:00:00');

    let cursor = new Date(eventDate);
    // Advance cursor to start of range
    while (cursor < start) {
      advanceCursor(cursor, event.recurrence);
    }
    // Generate occurrences within range
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
    default: cursor.setFullYear(9999); // stop
  }
}

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, date, start_time, end_time, member_id, recurrence, notes } = req.body;
  const result = run(db, `
    INSERT INTO events (title, icon, date, start_time, end_time, member_id, recurrence, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, icon || null, date, start_time || null, end_time || null, member_id || null, recurrence || null, notes || null]);
  req.app.locals.saveDb();
  res.json({ id: result.lastInsertRowid, ...req.body });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, date, start_time, end_time, member_id, recurrence, notes } = req.body;
  run(db, `UPDATE events SET title=?, icon=?, date=?, start_time=?, end_time=?, member_id=?, recurrence=?, notes=? WHERE id=?`,
    [title, icon || null, date, start_time || null, end_time || null, member_id || null, recurrence || null, notes || null, parseInt(req.params.id)]);
  req.app.locals.saveDb();
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  run(db, 'DELETE FROM events WHERE id = ?', [parseInt(req.params.id)]);
  req.app.locals.saveDb();
  res.json({ success: true });
});

module.exports = router;
