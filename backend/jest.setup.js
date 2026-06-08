// Use an in-memory database so tests don't touch jobs.db
process.env.DB_PATH = ':memory:';
