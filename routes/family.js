const express = require('express');
const router = express.Router();
const { queryAll, run } = require('../db/helpers');

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const members = queryAll(db, 'SELECT * FROM family_members ORDER BY role DESC, name');
  res.json(members);
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, color, emoji, role } = req.body;
  const result = run(db, 'INSERT INTO family_members (name, color, emoji, role) VALUES (?, ?, ?, ?)',
    [name, color, emoji, role || 'kid']);
  req.app.locals.saveDb();
  res.json({ id: result.lastInsertRowid, name, color, emoji, role: role || 'kid', total_points: 0 });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { name, color, emoji } = req.body;
  run(db, 'UPDATE family_members SET name = ?, color = ?, emoji = ? WHERE id = ?',
    [name, color, emoji, parseInt(req.params.id)]);
  req.app.locals.saveDb();
  res.json({ success: true });
});

module.exports = router;
