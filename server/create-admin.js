const pool = require('./db');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid ADMIN_EMAIL and ADMIN_PASSWORD in the trusted server environment.');
    if (password.length < 16) throw new Error('ADMIN_PASSWORD must be at least 16 characters.');

    const hash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (rows.length) {
        throw new Error('An account with this email already exists; bootstrap never overwrites an existing account.');
      } else {
        const [res] = await conn.execute('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [email, hash, 'Initial Admin', 'admin']);
        console.log(JSON.stringify({ success: true, message: 'Admin user created', id: res.insertId, email }));
      }
    } finally {
      conn.release();
    }
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  }
})();
