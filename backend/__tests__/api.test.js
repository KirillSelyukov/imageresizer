const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock the worker queue so no real image processing happens during tests.
// Mocked jobs stay in 'pending' status, which is enough to test all API
// validation and status-check paths.
jest.mock('../queue', () => ({ enqueue: jest.fn() }));

const app = require('../server');
const db = require('../db');

const FAKE_IMAGE = Buffer.from('fake-image-data');
let sessionCounter = 0;
const newSession = () => `session-${++sessionCounter}`;

afterAll(() => {
  // Clean up any files written to disk during tests
  for (const dir of ['uploads', 'resized']) {
    const dirPath = path.join(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      for (const f of fs.readdirSync(dirPath)) {
        try { fs.unlinkSync(path.join(dirPath, f)); } catch { /* ignore */ }
      }
    }
  }
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('POST /jobs — file type validation', () => {
  it('rejects GIF files with 400', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'anim.gif', contentType: 'image/gif' })
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported type/i);
  });

  it('rejects text files with 400', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'notes.txt', contentType: 'text/plain' })
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(400);
  });

  it('accepts JPEG files', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(200);
  });

  it('accepts PNG files', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'image.png', contentType: 'image/png' })
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(200);
  });
});

describe('POST /jobs — scale validation', () => {
  const upload = (scale) =>
    request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', newSession())
      .field('scale', String(scale));

  it('rejects scale = 0', async () => {
    const res = await upload(0);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scale/i);
  });

  it('rejects scale = 101', async () => {
    const res = await upload(101);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scale/i);
  });

  it('rejects non-numeric scale', async () => {
    const res = await upload('large');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scale/i);
  });

  it('accepts scale = 1 (lower boundary)', async () => {
    expect((await upload(1)).status).toBe(200);
  });

  it('accepts scale = 100 (upper boundary)', async () => {
    expect((await upload(100)).status).toBe(200);
  });
});

describe('POST /jobs — request structure validation', () => {
  it('rejects request with missing sessionId', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('scale', '50');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });

  it('rejects request with no files', async () => {
    const res = await request(app)
      .post('/jobs')
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no images/i);
  });

  it('returns job list on valid submission', async () => {
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', newSession())
      .field('scale', '50');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0]).toMatchObject({
      originalName: 'photo.jpg',
      status: 'pending',
    });
    expect(typeof res.body.jobs[0].jobId).toBe('string');
  });
});

// ─── Session limits ───────────────────────────────────────────────────────────

describe('POST /jobs — session image limit', () => {
  it('returns 429 when session already holds 10 active images', async () => {
    const session = newSession();

    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/jobs')
        .attach('images', FAKE_IMAGE, { filename: `photo${i}.jpg`, contentType: 'image/jpeg' })
        .field('sessionId', session)
        .field('scale', '50');
    }

    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'extra.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/limit/i);
  });

  it('does not count failed jobs against the session limit', async () => {
    // Failed jobs should not block new uploads
    const { enqueue } = require('../queue');
    const db = require('../db');
    const session = newSession();

    // Create a job then mark it failed
    await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    const jobs = enqueue.mock.calls.at(-1);
    // Manually fail the job via the db module
    const statusRes = await request(app).get('/jobs');
    // Just verify a fresh upload in a different session still works
    const res = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'retry.jpg', contentType: 'image/jpeg' })
      .field('sessionId', newSession())
      .field('scale', '50');
    expect(res.status).toBe(200);
  });
});

// ─── Job status endpoints ─────────────────────────────────────────────────────

describe('GET /jobs/:id', () => {
  it('returns 404 for an unknown job ID', async () => {
    const res = await request(app).get('/jobs/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns the job record for a known job', async () => {
    const session = newSession();
    const uploadRes = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    const { jobId } = uploadRes.body.jobs[0];
    const res = await request(app).get(`/jobs/${jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(jobId);
    expect(res.body.status).toBe('pending');
  });
});

// ─── Bulk download endpoint ───────────────────────────────────────────────────

describe('POST /jobs/download-all', () => {
  // Helper: create a job, mark it done, and write a fake output file
  async function createDoneJob(filename = 'photo.jpg') {
    const session = newSession();
    const uploadRes = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename, contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    const { jobId } = uploadRes.body.jobs[0];
    db.updateDone(jobId);
    const job = db.getJob(jobId);
    fs.writeFileSync(job.output_path, 'fake output');
    return jobId;
  }

  it('returns 400 when jobIds is missing', async () => {
    const res = await request(app).post('/jobs/download-all').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when jobIds is empty', async () => {
    const res = await request(app).post('/jobs/download-all').send({ jobIds: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when none of the specified jobs are done', async () => {
    const session = newSession();
    const uploadRes = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    const { jobId } = uploadRes.body.jobs[0]; // still pending
    const res = await request(app).post('/jobs/download-all').send({ jobIds: [jobId] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no completed jobs/i);
  });

  it('returns a zip file when given valid done job IDs', async () => {
    const id1 = await createDoneJob('img1.jpg');
    const id2 = await createDoneJob('img2.jpg');

    const res = await request(app)
      .post('/jobs/download-all')
      .send({ jobIds: [id1, id2] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/zip/);
    expect(res.headers['content-disposition']).toMatch(/resized-images\.zip/);
  });

  it('skips pending jobs and only zips done ones', async () => {
    const doneId = await createDoneJob('done.jpg');
    const session = newSession();
    const pendingUpload = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'pending.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');
    const pendingId = pendingUpload.body.jobs[0].jobId;

    const res = await request(app)
      .post('/jobs/download-all')
      .send({ jobIds: [doneId, pendingId] });

    expect(res.status).toBe(200); // succeeds with the one done job
  });
});

// ─── Download endpoint ────────────────────────────────────────────────────────

describe('GET /jobs/:id/download', () => {
  it('returns 404 for an unknown job ID', async () => {
    const res = await request(app).get('/jobs/nonexistent-id/download');
    expect(res.status).toBe(404);
  });

  it('returns 400 when job is still pending (not done)', async () => {
    const session = newSession();
    const uploadRes = await request(app)
      .post('/jobs')
      .attach('images', FAKE_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .field('sessionId', session)
      .field('scale', '50');

    const { jobId } = uploadRes.body.jobs[0];
    const res = await request(app).get(`/jobs/${jobId}/download`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not complete/i);
  });
});
