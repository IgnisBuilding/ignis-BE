const bcryptjs = require('bcryptjs');

const password = 'admin123';
const hash = '$2b$10$5gnp/38nsPT0nDkA0RiPF.jtbiUFF6bIphk8t5mzcjnJP.ko3Yp8a';

bcryptjs.compare(password, hash, (err, result) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Password match:', result);
  }
});

// Also test creating a new hash
bcryptjs.hash(password, 10, (err, newHash) => {
  if (err) {
    console.error('Hash error:', err);
  } else {
    console.log('New hash:', newHash);
  }
});
