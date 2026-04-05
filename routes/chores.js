const express = require('express');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db/helpers');

// "Today" in Pacific time as YYYY-MM-DD — daily reset happens at midnight PT
function pacificToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const chores = queryAll(db, `
    SELECT c.*, f.name as assigned_name, f.color as assigned_color, f.emoji as assigned_emoji
    FROM chores c
    LEFT JOIN family_members f ON c.assigned_to = f.id
    ORDER BY c.sort_order, c.id
  `);
  res.json(chores);
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, points, assigned_to, recurrence, sort_order } = req.body;
  const result = run(db, 'INSERT INTO chores (title, icon, points, assigned_to, recurrence, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [title, icon, points, assigned_to || null, recurrence || 'daily', sort_order ?? 0]);
  req.app.locals.saveDb();
  res.json({ id: result.lastInsertRowid, ...req.body });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, points, assigned_to, recurrence, sort_order } = req.body;
  run(db, 'UPDATE chores SET title=?, icon=?, points=?, assigned_to=?, recurrence=?, sort_order=? WHERE id=?',
    [title, icon, points, assigned_to || null, recurrence || 'daily', sort_order ?? 0, parseInt(req.params.id)]);
  req.app.locals.saveDb();
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  run(db, 'DELETE FROM chore_completions WHERE chore_id = ?', [parseInt(req.params.id)]);
  run(db, 'DELETE FROM chores WHERE id = ?', [parseInt(req.params.id)]);
  req.app.locals.saveDb();
  res.json({ success: true });
});

// Get completion status for a specific date
router.get('/status', (req, res) => {
  const db = req.app.locals.db;
  const { date } = req.query;
  const today = date || pacificToday();

  const completions = queryAll(db, `
    SELECT cc.*, c.title, c.icon, f.name as member_name, f.color as member_color
    FROM chore_completions cc
    JOIN chores c ON cc.chore_id = c.id
    JOIN family_members f ON cc.member_id = f.id
    WHERE cc.completed_date = ?
  `, [today]);
  res.json(completions);
});

// Complete a chore
router.post('/:id/complete', (req, res) => {
  const db = req.app.locals.db;
  const { member_id, date } = req.body;
  const choreId = parseInt(req.params.id);
  const chore = queryOne(db, 'SELECT * FROM chores WHERE id = ?', [choreId]);

  if (!chore) return res.status(404).json({ error: 'Chore not found' });

  const today = date || pacificToday();

  const existing = queryOne(db,
    'SELECT * FROM chore_completions WHERE chore_id = ? AND member_id = ? AND completed_date = ?',
    [choreId, member_id, today]);

  if (existing) return res.status(400).json({ error: 'Already completed today' });

  run(db, 'INSERT INTO chore_completions (chore_id, member_id, completed_date, points_earned) VALUES (?, ?, ?, ?)',
    [choreId, member_id, today, chore.points]);

  run(db, 'UPDATE family_members SET total_points = total_points + ? WHERE id = ?',
    [chore.points, member_id]);

  const member = queryOne(db, 'SELECT * FROM family_members WHERE id = ?', [member_id]);
  req.app.locals.saveDb();

  res.json({
    success: true,
    points_earned: chore.points,
    total_points: member.total_points
  });
});

// Uncomplete a chore
router.post('/:id/uncomplete', (req, res) => {
  const db = req.app.locals.db;
  const { member_id, date } = req.body;
  const choreId = parseInt(req.params.id);
  const today = date || pacificToday();

  const completion = queryOne(db,
    'SELECT * FROM chore_completions WHERE chore_id = ? AND member_id = ? AND completed_date = ?',
    [choreId, member_id, today]);

  if (!completion) return res.status(404).json({ error: 'Not completed' });

  run(db, 'DELETE FROM chore_completions WHERE id = ?', [completion.id]);
  run(db, 'UPDATE family_members SET total_points = total_points - ? WHERE id = ?',
    [completion.points_earned, member_id]);

  const member = queryOne(db, 'SELECT * FROM family_members WHERE id = ?', [member_id]);
  req.app.locals.saveDb();
  res.json({ success: true, total_points: member.total_points });
});

// Points and rewards
router.get('/points/:memberId', (req, res) => {
  const db = req.app.locals.db;
  const memberId = parseInt(req.params.memberId);
  const member = queryOne(db, 'SELECT * FROM family_members WHERE id = ?', [memberId]);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const history = queryAll(db, `
    SELECT cc.*, c.title, c.icon
    FROM chore_completions cc
    JOIN chores c ON cc.chore_id = c.id
    WHERE cc.member_id = ?
    ORDER BY cc.completed_date DESC
    LIMIT 50
  `, [memberId]);

  // Calculate streak
  let streak = 0;
  const dates = queryAll(db, `
    SELECT DISTINCT completed_date FROM chore_completions
    WHERE member_id = ? ORDER BY completed_date DESC
  `, [memberId]).map(r => r.completed_date);

  // Walk back day-by-day in Pacific time
  const todayStr = pacificToday();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const anchor = new Date(Date.UTC(ty, tm - 1, td));
  for (let i = 0; i < dates.length; i++) {
    const expected = new Date(anchor);
    expected.setUTCDate(expected.getUTCDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];
    if (dates[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  res.json({ member, history, streak });
});

// Rewards
router.get('/rewards', (req, res) => {
  const db = req.app.locals.db;
  const rewards = queryAll(db, 'SELECT * FROM rewards ORDER BY cost');
  res.json(rewards);
});

router.post('/rewards', (req, res) => {
  const db = req.app.locals.db;
  const { title, icon, cost } = req.body;
  const result = run(db, 'INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', [title, icon, cost]);
  req.app.locals.saveDb();
  res.json({ id: result.lastInsertRowid, title, icon, cost });
});

router.post('/rewards/:id/redeem', (req, res) => {
  const db = req.app.locals.db;
  const { member_id } = req.body;
  const rewardId = parseInt(req.params.id);
  const reward = queryOne(db, 'SELECT * FROM rewards WHERE id = ?', [rewardId]);
  const member = queryOne(db, 'SELECT * FROM family_members WHERE id = ?', [member_id]);

  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.total_points < reward.cost) return res.status(400).json({ error: 'Not enough points' });

  const today = pacificToday();
  run(db, 'INSERT INTO reward_redemptions (reward_id, member_id, redeemed_date, points_spent) VALUES (?, ?, ?, ?)',
    [rewardId, member_id, today, reward.cost]);

  run(db, 'UPDATE family_members SET total_points = total_points - ? WHERE id = ?',
    [reward.cost, member_id]);

  const updated = queryOne(db, 'SELECT * FROM family_members WHERE id = ?', [member_id]);
  req.app.locals.saveDb();
  res.json({ success: true, total_points: updated.total_points });
});

module.exports = router;
