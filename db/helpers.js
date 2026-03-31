// Convert sql.js result to array of objects
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows[0] || null;
}

function run(db, sql, params = []) {
  db.run(sql, params);
  return { lastInsertRowid: queryOne(db, 'SELECT last_insert_rowid() as id').id };
}

module.exports = { queryAll, queryOne, run };
