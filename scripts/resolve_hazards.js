const {Client}=require('pg');
require('dotenv').config();
const client = new Client({connectionString: process.env.DATABASE_URL});
client.connect().then(() => {
  client.query("UPDATE hazards SET status = 'resolved' WHERE status = 'active' OR status = 'pending'")
    .then(res => {
      console.log('Resolved', res.rowCount, 'hazards');
      client.end();
    })
    .catch(e => console.error(e));
});
