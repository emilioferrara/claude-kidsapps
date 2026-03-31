function initDatabase(db) {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      emoji TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent', 'kid')),
      total_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT,
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      member_id INTEGER,
      recurrence TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      points INTEGER NOT NULL,
      assigned_to INTEGER,
      recurrence TEXT DEFAULT 'daily',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_to) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS chore_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chore_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      completed_date TEXT NOT NULL,
      points_earned INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (chore_id) REFERENCES chores(id),
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      cost INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      redeemed_date TEXT NOT NULL,
      points_spent INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (reward_id) REFERENCES rewards(id),
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );
  `);

  // Seed data only if tables are empty
  const result = db.exec('SELECT COUNT(*) as c FROM family_members');
  const count = result[0].values[0][0];
  if (count === 0) {
    db.run('INSERT INTO family_members (name, color, emoji, role) VALUES (?, ?, ?, ?)', ['Emilio', '#6C5CE7', '🧔', 'parent']);
    db.run('INSERT INTO family_members (name, color, emoji, role) VALUES (?, ?, ?, ?)', ['Noemi', '#FF6B6B', '🐡', 'kid']);
    db.run('INSERT INTO family_members (name, color, emoji, role) VALUES (?, ?, ?, ?)', ['Leo', '#00B894', '🦖', 'kid']);

    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Make bed', '🛏️', 10, null, 'daily']);
    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Brush teeth', '🪥', 5, null, 'daily']);
    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Put toys away', '🧸', 15, null, 'daily']);
    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Read for 15 min', '📚', 20, null, 'daily']);
    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Help set table', '🍽️', 10, null, 'daily']);
    db.run('INSERT INTO chores (title, icon, points, assigned_to, recurrence) VALUES (?, ?, ?, ?, ?)', ['Water the plants', '🌱', 15, null, 'weekly']);

    db.run('INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', ['Extra screen time', '📱', 50]);
    db.run('INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', ['Choose dinner', '🍕', 75]);
    db.run('INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', ['Stay up 30 min late', '🌙', 100]);
    db.run('INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', ['Pick a movie', '🎬', 60]);
    db.run('INSERT INTO rewards (title, icon, cost) VALUES (?, ?, ?)', ['Ice cream treat', '🍦', 40]);

    const today = new Date().toISOString().split('T')[0];
    db.run('INSERT INTO events (title, icon, date, start_time, end_time, member_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['Family game night', '🎲', today, '19:00', '21:00', null]);

    console.log('Database seeded with initial data');
  }
}

module.exports = { initDatabase };
