const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const db = require('./db');
const { enqueue } = require('./queue');

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RESIZED_DIR = path.join(__dirname, 'resized');
const MAX_IMAGES_PER_SESSION = 10;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RESIZED_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setTimeout(30_000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported type: ${file.mimetype}. Only JPEG and PNG are allowed.`));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /jobs  — upload images and queue resize jobs
app.post('/jobs', (req, res) => {
  upload.array('images', MAX_IMAGES_PER_SESSION)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { sessionId, scale } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      cleanup(req.files);
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const scaleNum = parseInt(scale, 10);
    if (isNaN(scaleNum) || scaleNum < 1 || scaleNum > 100) {
      cleanup(req.files);
      return res.status(400).json({ error: 'scale must be between 1 and 100' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const active = db.countActiveJobs(sessionId);
    if (active + req.files.length > MAX_IMAGES_PER_SESSION) {
      cleanup(req.files);
      return res.status(429).json({
        error: `Limit of ${MAX_IMAGES_PER_SESSION} images per session. You currently have ${active}.`,
      });
    }

    const jobs = req.files.map((file) => {
      const jobId = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const outputPath = path.join(RESIZED_DIR, `${jobId}${ext}`);

      db.createJob({
        id: jobId,
        sessionId,
        inputPath: file.path,
        outputPath,
        scale: scaleNum,
        originalName: file.originalname,
      });

      enqueue({ jobId, inputPath: file.path, outputPath, scale: scaleNum });

      return { jobId, originalName: file.originalname, status: 'pending' };
    });

    res.json({ jobs });
  });
});

// POST /jobs/download-all — zip all specified done jobs and stream as download
app.post('/jobs/download-all', (req, res) => {
  const { jobIds } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ error: 'jobIds must be a non-empty array' });
  }

  const jobs = db.getJobsByIds(jobIds);
  const doneJobs = jobs.filter((j) => j.status === 'done');

  if (doneJobs.length === 0) {
    return res.status(400).json({ error: 'No completed jobs found for the given IDs' });
  }

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create archive' });
    }
  });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="resized-images.zip"');

  archive.pipe(res);
  doneJobs.forEach((job) => archive.file(job.output_path, { name: `resized_${job.original_name}` }));
  archive.finalize();

  res.on('finish', () => {
    doneJobs.forEach((job) => {
      fs.unlink(job.output_path, () => {});
      fs.unlink(job.input_path, () => {});
      db.deleteJob(job.id);
    });
  });
});

// GET /jobs/:id — poll job status
app.get('/jobs/:id', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /jobs/:id/download — download resized image
app.get('/jobs/:id/download', (req, res) => {
  const job = db.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ error: 'Job not complete' });

  const filename = `resized_${job.original_name}`;
  res.download(job.output_path, filename, (downloadErr) => {
    if (!downloadErr) {
      fs.unlink(job.output_path, () => {});
      fs.unlink(job.input_path, () => {});
      db.deleteJob(job.id);
    }
  });
});

function cleanup(files) {
  if (!files) return;
  files.forEach((f) => fs.unlink(f.path, () => {}));
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
