const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '011539',
    database: process.env.DB_NAME || 'ignis',
  });

  try {
    await client.connect();
    console.log('Connected to DB');
    const res = await client.query(
      `ALTER TABLE camera ADD COLUMN IF NOT EXISTS privacy_mode boolean DEFAULT false;`
    );
    console.log('privacy_mode column ensured');
  } catch (err) {
    console.error('Error applying ALTER TABLE:', err.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
