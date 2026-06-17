const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

function saveDatabase() {
  if (!db || !dbPath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function rowsToObjects(result) {
  if (!result || !result.length) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

function getFirstRow(result) {
  const rows = rowsToObjects(result);
  return rows.length > 0 ? rows[0] : null;
}

async function init(dbFilePath) {
  dbPath = dbFilePath;
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  seedDefaultTag();
  saveDatabase();
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#4CAF50',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag_id INTEGER,
      duration_minutes INTEGER NOT NULL,
      phase TEXT NOT NULL,
      is_valid INTEGER NOT NULL DEFAULT 1,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      work_duration INTEGER NOT NULL DEFAULT 25,
      short_break_duration INTEGER NOT NULL DEFAULT 5,
      long_break_duration INTEGER NOT NULL DEFAULT 15
    );
  `);
}

function seedDefaultTag() {
  const result = db.exec('SELECT COUNT(*) as count FROM tags');
  const count = result[0]?.values[0]?.[0] || 0;
  if (count === 0) {
    db.run("INSERT INTO tags (name, color) VALUES ('默认', '#4CAF50')");
  }
}

function getTags() {
  const result = db.exec('SELECT * FROM tags ORDER BY created_at ASC');
  return rowsToObjects(result);
}

function addTag(name, color) {
  db.run("INSERT INTO tags (name, color) VALUES (?, ?)", [name, color || '#4CAF50']);
  saveDatabase();
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0];
  return getTagById(id);
}

function getTagById(id) {
  const result = db.exec("SELECT * FROM tags WHERE id = " + parseInt(id));
  return getFirstRow(result);
}

function deleteTag(id) {
  db.run("DELETE FROM tags WHERE id = ?", [id]);
  saveDatabase();
  return true;
}

function getTagStats(tagId) {
  const result = db.exec(`
    SELECT 
      COALESCE(SUM(CASE WHEN date(started_at) = date('now') AND is_valid = 1 AND phase = 'work' THEN duration_minutes ELSE 0 END), 0) as today_minutes,
      COALESCE(SUM(CASE WHEN is_valid = 1 AND phase = 'work' THEN duration_minutes ELSE 0 END), 0) as total_minutes,
      COALESCE(SUM(CASE WHEN is_valid = 1 AND phase = 'work' THEN 1 ELSE 0 END), 0) as total_sessions
    FROM sessions
    WHERE tag_id = ${parseInt(tagId)}
  `);
  return getFirstRow(result) || { today_minutes: 0, total_minutes: 0, total_sessions: 0 };
}

function getTodaySessions(tagId) {
  const result = db.exec(`
    SELECT id, duration_minutes, phase, is_valid, started_at
    FROM sessions
    WHERE tag_id = ${parseInt(tagId)} AND date(started_at) = date('now')
    ORDER BY started_at DESC
  `);
  return rowsToObjects(result);
}

function addSession(tagId, durationMinutes, phase) {
  db.run(`
    INSERT INTO sessions (tag_id, duration_minutes, phase, is_valid)
    VALUES (?, ?, ?, 1)
  `, [tagId, durationMinutes, phase]);
  saveDatabase();
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0].values[0][0];
}

function toggleSessionValid(sessionId, isValid) {
  db.run('UPDATE sessions SET is_valid = ? WHERE id = ?', [isValid ? 1 : 0, sessionId]);
  saveDatabase();
  return true;
}

function getSettings() {
  const result = db.exec('SELECT * FROM settings WHERE id = 1');
  const settings = getFirstRow(result);
  if (!settings) {
    return {
      work_duration: 25,
      short_break_duration: 5,
      long_break_duration: 15
    };
  }
  return settings;
}

function saveSettings(settings) {
  const existing = db.exec('SELECT id FROM settings WHERE id = 1');
  if (existing.length && existing[0].values.length) {
    db.run(`
      UPDATE settings 
      SET work_duration = ?, short_break_duration = ?, long_break_duration = ?
      WHERE id = 1
    `, [settings.workDuration, settings.shortBreakDuration, settings.longBreakDuration]);
  } else {
    db.run(`
      INSERT INTO settings (id, work_duration, short_break_duration, long_break_duration)
      VALUES (1, ?, ?, ?)
    `, [settings.workDuration, settings.shortBreakDuration, settings.longBreakDuration]);
  }
  saveDatabase();
  return true;
}

module.exports = {
  init,
  getTags,
  addTag,
  deleteTag,
  getTagStats,
  getTodaySessions,
  addSession,
  toggleSessionValid,
  getSettings,
  saveSettings
};
