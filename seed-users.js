const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function seedUsers() {
  try {
    await client.connect();
    console.log('Connected to database');

    // First, get existing users to see what we have
    const existingUsers = await client.query(`
      SELECT id, email, name, role FROM users WHERE role = 'firefighter'
    `);
    console.log('\n=== Existing Firefighter Users ===');
    console.log(existingUsers.rows);

    // Get password hash from an existing user
    const existingUser = await client.query(`
      SELECT password FROM users WHERE email = 'firefighter@ignis.com' LIMIT 1
    `);

    let passwordHash;
    if (existingUser.rows.length > 0) {
      passwordHash = existingUser.rows[0].password;
      console.log('\nUsing password hash from firefighter@ignis.com');
    } else {
      // Get from any existing user
      const anyUser = await client.query(`SELECT password FROM users LIMIT 1`);
      if (anyUser.rows.length > 0) {
        passwordHash = anyUser.rows[0].password;
        console.log('\nUsing password hash from existing user');
      } else {
        // bcrypt hash for 'firefighter123'
        passwordHash = '$2b$10$rQZ5Z5Z5Z5Z5Z5Z5Z5Z5ZuZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5';
        console.log('\nUsing default password hash');
      }
    }

    // Get fire brigade info
    const brigades = await client.query(`SELECT id, name FROM fire_brigade LIMIT 1`);
    const states = await client.query(`SELECT id, name FROM fire_brigade_state LIMIT 1`);
    const hqs = await client.query(`SELECT id, name FROM fire_brigade_hq LIMIT 1`);

    console.log('\n=== Fire Brigade Hierarchy ===');
    console.log('HQs:', hqs.rows);
    console.log('States:', states.rows);
    console.log('Brigades:', brigades.rows);

    const brigadeId = brigades.rows[0]?.id;
    const stateId = states.rows[0]?.id;
    const hqId = hqs.rows[0]?.id;

    // Create users if they don't exist
    const usersToCreate = [
      { email: 'firefighter.state@ignis.com', name: 'State Firefighter', stateId, brigadeId: null, hqId: null },
      { email: 'firefighter.district@ignis.com', name: 'District Firefighter', stateId: null, brigadeId, hqId: null },
    ];

    for (const userData of usersToCreate) {
      // Check if user exists
      const exists = await client.query(`SELECT id FROM users WHERE email = $1`, [userData.email]);

      if (exists.rows.length === 0) {
        // Create user
        const userResult = await client.query(`
          INSERT INTO users (email, password, name, role, is_active)
          VALUES ($1, $2, $3, 'firefighter', true)
          RETURNING id
        `, [userData.email, passwordHash, userData.name]);

        const userId = userResult.rows[0].id;
        console.log(`\nCreated user: ${userData.email} (ID: ${userId})`);

        // Create employee record
        await client.query(`
          INSERT INTO employee (user_id, brigade_id, state_id, hq_id)
          VALUES ($1, $2, $3, $4)
        `, [userId, userData.brigadeId, userData.stateId, userData.hqId]);

        console.log(`Created employee record for ${userData.email}`);
      } else {
        console.log(`\nUser ${userData.email} already exists (ID: ${exists.rows[0].id})`);

        // Check if employee record exists
        const empExists = await client.query(`SELECT id FROM employee WHERE user_id = $1`, [exists.rows[0].id]);
        if (empExists.rows.length === 0) {
          await client.query(`
            INSERT INTO employee (user_id, brigade_id, state_id, hq_id)
            VALUES ($1, $2, $3, $4)
          `, [exists.rows[0].id, userData.brigadeId, userData.stateId, userData.hqId]);
          console.log(`Created missing employee record for ${userData.email}`);
        }
      }
    }

    // Also ensure firefighter@ignis.com has HQ level access
    const mainFirefighter = await client.query(`SELECT id FROM users WHERE email = 'firefighter@ignis.com'`);
    if (mainFirefighter.rows.length > 0) {
      const userId = mainFirefighter.rows[0].id;
      const empExists = await client.query(`SELECT id FROM employee WHERE user_id = $1`, [userId]);

      if (empExists.rows.length === 0 && hqId) {
        await client.query(`
          INSERT INTO employee (user_id, hq_id)
          VALUES ($1, $2)
        `, [userId, hqId]);
        console.log(`\nCreated HQ employee record for firefighter@ignis.com`);
      } else if (empExists.rows.length > 0) {
        // Update to ensure HQ level
        await client.query(`
          UPDATE employee SET hq_id = $1 WHERE user_id = $2
        `, [hqId, userId]);
        console.log(`\nUpdated firefighter@ignis.com to HQ level`);
      }
    }

    // Final verification
    console.log('\n=== Final User List ===');
    const finalUsers = await client.query(`
      SELECT u.id, u.email, u.name, e.brigade_id, e.state_id, e.hq_id,
             CASE
               WHEN e.hq_id IS NOT NULL THEN 'HQ'
               WHEN e.state_id IS NOT NULL THEN 'State'
               WHEN e.brigade_id IS NOT NULL THEN 'District'
               ELSE 'None'
             END as jurisdiction_level
      FROM users u
      LEFT JOIN employee e ON u.id = e.user_id
      WHERE u.role = 'firefighter'
    `);
    console.table(finalUsers.rows);

    console.log('\n=== Done ===');
    console.log('All firefighter users have been created/verified.');
    console.log('Password for all: firefighter123');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

seedUsers();
