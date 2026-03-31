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

  let events;
  if (date) {
    events = queryAll(db, `${baseQuery} WHERE e.date = ? ORDER BY e.start_time`, [date]);
  } else if (month) {
    events = queryAll(db, `${baseQuery} WHERE e.date LIKE ? ORDER BY e.date, e.start_time`, [`${month}%`]);
  } else {
    events = queryAll(db, `${baseQuery} ORDER BY e.date DESC, e.start_time LIMIT 100`);
  }
  res.json(events);
});

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
