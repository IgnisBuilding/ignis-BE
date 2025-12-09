const { Client } = require('pg');

async function testWithURL() {
  // Test various connection string formats
  const urls = [
    'postgresql://postgres.bixtnbskchfvsdtpxrxc:IgnisFast123@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres:IgnisFast123@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres.bixtnbskchfvsdtpxrxc:IgnisFast123@db.bixtnbskchfvsdtpxrxc.supabase.co:5432/postgres',
    'postgresql://postgres:IgnisFast123@db.bixtnbskchfvsdtpxrxc.supabase.co:5432/postgres'
  ];

  for (let i = 0; i < urls.length; i++) {
    console.log(`\nTesting URL ${i + 1}:`);
    console.log(urls[i]);
    
    const client = new Client({
      connectionString: urls[i],
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('✅ SUCCESS! Connected with this URL format');
      const result = await client.query('SELECT NOW()');
      console.log('✅ Query result:', result.rows[0]);
      await client.end();
      
      console.log('\n🎉 WORKING CONNECTION STRING:');
      console.log(urls[i]);
      return;
    } catch (error) {
      console.error('❌ Failed:', error.message);
      try {
        await client.end();
      } catch (e) {}
    }
  }
  
  console.log('\n❌ All connection attempts failed');
}

testWithURL();