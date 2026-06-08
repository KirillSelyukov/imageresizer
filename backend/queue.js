const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');
const db = require('./db');

const POOL_SIZE = Math.max(2, os.cpus().length - 1);
const pending = [];

function makeWorker() {
  const state = { busy: false, currentJobId: null };

  const worker = new Worker(path.join(__dirname, 'worker.js'));

  worker.on('message', ({ jobId, success, error }) => {
    if (success) {
      db.updateDone(jobId);
    } else {
      db.updateFailed(jobId, error || 'Unknown error');
    }
    state.busy = false;
    state.currentJobId = null;
    dispatch();
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
    if (state.currentJobId) {
      db.updateFailed(state.currentJobId, 'Worker crashed');
    }
    state.busy = false;
    state.currentJobId = null;
    // Replace crashed worker
    const idx = pool.indexOf(entry);
    if (idx !== -1) pool[idx] = makeWorker();
    dispatch();
  });

  const entry = { worker, state };
  return entry;
}

const pool = Array.from({ length: POOL_SIZE }, makeWorker);

function dispatch() {
  if (pending.length === 0) return;
  const free = pool.find(w => !w.state.busy);
  if (!free) return;

  const job = pending.shift();
  free.state.busy = true;
  free.state.currentJobId = job.jobId;
  db.updateStatus(job.jobId, 'processing');
  free.worker.postMessage(job);
}

function enqueue(job) {
  pending.push(job);
  dispatch();
}

module.exports = { enqueue };
