// Tests never read a developer's database or send external email.
process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'memory';
process.env.JWT_SECRET = 'test-only-access-secret-not-for-deployment-123456';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-not-for-deployment-123456';
for (const key of ['DIRECT_URL', 'PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'RESEND_API_KEY', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) delete process.env[key];
// Opt-in PostgreSQL integration run: MTAA_TEST_DATABASE_URL=postgresql://...
// Without it, suites use the isolated in-memory store and never touch a real DB.
if (process.env.MTAA_TEST_DATABASE_URL) { process.env.DATABASE_URL = process.env.MTAA_TEST_DATABASE_URL; process.env.DB_POOL_SIZE ||= '1'; }
else delete process.env.DATABASE_URL;
