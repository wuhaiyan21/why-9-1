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
      daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const tagCols = db.exec("PRAGMA table_info(tags)");
  if (tagCols && tagCols.length) {
    const hasDailyGoal = tagCols[0].values.some(row => row[1] === 'daily_goal_minutes');
    if (!hasDailyGoal) {
      db.run("ALTER TABLE tags ADD COLUMN daily_goal_minutes INTEGER NOT NULL DEFAULT 120");
    }
  }

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
      long_break_duration INTEGER NOT NULL DEFAULT 15,
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      sound_volume INTEGER NOT NULL DEFAULT 70
    );
  `);

  const settingsCols = db.exec("PRAGMA table_info(settings)");
  if (settingsCols && settingsCols.length) {
    const hasSoundEnabled = settingsCols[0].values.some(row => row[1] === 'sound_enabled');
    const hasSoundVolume = settingsCols[0].values.some(row => row[1] === 'sound_volume');
    if (!hasSoundEnabled) {
      db.run("ALTER TABLE settings ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1");
    }
    if (!hasSoundVolume) {
      db.run("ALTER TABLE settings ADD COLUMN sound_volume INTEGER NOT NULL DEFAULT 70");
    }
  }
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

function addTag(name, color, dailyGoalMinutes) {
  const goal = dailyGoalMinutes ? parseInt(dailyGoalMinutes) : 120;
  db.run("INSERT INTO tags (name, color, daily_goal_minutes) VALUES (?, ?, ?)", [name, color || '#4CAF50', goal]);
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0];
  saveDatabase();
  const tags = getTags();
  return tags.find(t => t.id === id) || null;
}

function updateTagDailyGoal(tagId, dailyGoalMinutes) {
  db.run("UPDATE tags SET daily_goal_minutes = ? WHERE id = ?", [parseInt(dailyGoalMinutes), parseInt(tagId)]);
  saveDatabase();
  const tags = getTags();
  return tags.find(t => t.id === parseInt(tagId)) || null;
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

function getSessionsByDate(tagId, dateStr) {
  const result = db.exec(`
    SELECT id, duration_minutes, phase, is_valid, started_at
    FROM sessions
    WHERE tag_id = ${parseInt(tagId)} AND date(started_at) = date('${dateStr}')
    ORDER BY started_at DESC
  `);
  return rowsToObjects(result);
}

function getWeeklyStats(tagId) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const result = db.exec(`
      SELECT COALESCE(SUM(CASE WHEN is_valid = 1 AND phase = 'work' THEN duration_minutes ELSE 0 END), 0) as minutes
      FROM sessions
      WHERE tag_id = ${parseInt(tagId)} AND date(started_at) = date('now', '-${i} days')
    `);
    const minutes = result && result.length && result[0].values.length ? result[0].values[0][0] : 0;
    const dateResult = db.exec(`SELECT date('now', '-${i} days') as d`);
    const date = dateResult && dateResult.length && dateResult[0].values.length ? dateResult[0].values[0][0] : '';
    days.push({ date, minutes });
  }
  return days;
}

function addSession(tagId, durationMinutes, phase) {
  db.run(`
    INSERT INTO sessions (tag_id, duration_minutes, phase, is_valid)
    VALUES (?, ?, ?, 1)
  `, [tagId, durationMinutes, phase]);
  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0];
  saveDatabase();
  return id;
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
      long_break_duration: 15,
      sound_enabled: 1,
      sound_volume: 70
    };
  }
  return settings;
}

function saveSettings(settings) {
  const existing = db.exec('SELECT id FROM settings WHERE id = 1');
  const soundEnabled = settings.soundEnabled !== undefined ? (settings.soundEnabled ? 1 : 0) : 1;
  const soundVolume = settings.soundVolume !== undefined ? parseInt(settings.soundVolume) : 70;
  if (existing.length && existing[0].values.length) {
    db.run(`
      UPDATE settings 
      SET work_duration = ?, short_break_duration = ?, long_break_duration = ?,
          sound_enabled = ?, sound_volume = ?
      WHERE id = 1
    `, [settings.workDuration, settings.shortBreakDuration, settings.longBreakDuration, soundEnabled, soundVolume]);
  } else {
    db.run(`
      INSERT INTO settings (id, work_duration, short_break_duration, long_break_duration, sound_enabled, sound_volume)
      VALUES (1, ?, ?, ?, ?, ?)
    `, [settings.workDuration, settings.shortBreakDuration, settings.longBreakDuration, soundEnabled, soundVolume]);
  }
  saveDatabase();
  return true;
}

module.exports = {
  init,
  getTags,
  addTag,
  deleteTag,
  updateTagDailyGoal,
  getTagStats,
  getTodaySessions,
  getSessionsByDate,
  getWeeklyStats,
  addSession,
  toggleSessionValid,
  getSettings,
  saveSettings
};
