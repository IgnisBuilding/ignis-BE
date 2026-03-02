const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function fixPassword() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Get the working password from firefighter@ignis.com (which we know works)
    const workingUser = await client.query(`
      SELECT password FROM users WHERE email = 'firefighter@ignis.com'
    `);

    if (workingUser.rows.length === 0) {
      console.log('Could not find firefighter@ignis.com');
      return;
    }

    const workingHash = workingUser.rows[0].password;
    console.log('Working password hash from firefighter@ignis.com');

    // Update all firefighter users to use the same password hash
    const result = await client.query(`
      UPDATE users
      SET password = $1
      WHERE email IN ('firefighter.district@ignis.com', 'firefighter.state@ignis.com', 'district.firefighter@ignis.com', 'state.firefighter@ignis.com', 'hq.firefighter@ignis.com')
      RETURNING email
    `, [workingHash]);

    console.log('\nUpdated passwords for:');
    result.rows.forEach(r => console.log('  -', r.email));

    // Verify all users
    console.log('\n=== All Firefighter Users ===');
    const allUsers = await client.query(`
      SELECT id, email, name,
             CASE WHEN password = $1 THEN 'OK' ELSE 'DIFFERENT' END as password_status
      FROM users
      WHERE role = 'firefighter'
      ORDER BY id
    `, [workingHash]);

    console.table(allUsers.rows);

    console.log('\n=== Done ===');
    console.log('All firefighter accounts now use password: firefighter123');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixPassword();
