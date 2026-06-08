const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'jobs.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input_path TEXT NOT NULL,
    output_path TEXT NOT NULL,
    scale INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_session ON jobs(session_id);
`);

// On startup, fail any jobs that were in-flight when the server last stopped
db.prepare(`
  UPDATE jobs
  SET status = 'failed', error_message = 'Server restarted', updated_at = unixepoch()
  WHERE status IN ('pending', 'processing')
`).run();

module.exports = {
  createJob({ id, sessionId, inputPath, outputPath, scale, originalName }) {
    db.prepare(`
      INSERT INTO jobs (id, session_id, status, input_path, output_path, scale, original_name)
      VALUES (?, ?, 'pending', ?, ?, ?, ?)
    `).run(id, sessionId, inputPath, outputPath, scale, originalName);
  },

  getJob(id) {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  },

  updateStatus(id, status) {
    db.prepare(`
      UPDATE jobs SET status = ?, updated_at = unixepoch() WHERE id = ?
    `).run(status, id);
  },

  updateDone(id) {
    db.prepare(`
      UPDATE jobs SET status = 'done', updated_at = unixepoch() WHERE id = ?
    `).run(id);
  },

  updateFailed(id, errorMessage) {
    db.prepare(`
      UPDATE jobs SET status = 'failed', error_message = ?, updated_at = unixepoch() WHERE id = ?
    `).run(errorMessage, id);
  },

  countActiveJobs(sessionId) {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM jobs
      WHERE session_id = ? AND status IN ('pending', 'processing', 'done')
    `).get(sessionId).n;
  },

  getJobsByIds(ids) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM jobs WHERE id IN (${placeholders})`).all(...ids);
  },

  deleteJob(id) {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  },
};
