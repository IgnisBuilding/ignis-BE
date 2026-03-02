const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function fixAllPasswords() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Generate proper hash for firefighter123
    const password = 'firefighter123';
    const hash = await bcrypt.hash(password, 10);
    console.log('Generated hash for "firefighter123"');

    // Update ALL firefighter users
    const result = await client.query(`
      UPDATE users
      SET password = $1
      WHERE role = 'firefighter'
      RETURNING email
    `, [hash]);

    console.log('\nUpdated passwords for:');
    result.rows.forEach(r => console.log('  -', r.email));

    // Verify
    console.log('\n--- Verification ---');
    const users = await client.query(`
      SELECT email, password FROM users WHERE role = 'firefighter'
    `);

    for (const user of users.rows) {
      const isValid = await bcrypt.compare(password, user.password);
      console.log(`${user.email}: ${isValid ? 'OK' : 'FAILED'}`);
    }

    console.log('\n=== Done ===');
    console.log('All firefighter accounts now use password: firefighter123');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixAllPasswords();
