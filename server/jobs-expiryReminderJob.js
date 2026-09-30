const cron = require('node-cron');
const pool = require('./db');

const runExpiryReminderJob = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [mous] = await connection.query(`
      SELECT m.id, c.name AS college_name, m.valid_upto,
             DATEDIFF(m.valid_upto, UTC_DATE()) AS days_left
      FROM mous m
      JOIN colleges c ON c.id = m.college_id
      WHERE m.valid_upto IS NOT NULL
        AND DATEDIFF(m.valid_upto, UTC_DATE()) IN (90, 30, 7)
    `);

    const [projects] = await connection.query(`
      SELECT p.id, p.title, p.end_date, m.id AS mou_id, c.name AS college_name,
             DATEDIFF(p.end_date, UTC_DATE()) AS days_left
        FROM projects p
        JOIN mous m ON m.id = p.mou_id
        JOIN colleges c ON c.id = m.college_id
       WHERE p.end_date IS NOT NULL
         AND DATEDIFF(p.end_date, UTC_DATE()) IN (90, 30, 7)
    `);

    const [users] = await connection.query(`SELECT id FROM users WHERE role IN ('admin','viewer')`);

    for (const mou of mous) {
      for (const user of users) {
        const title = `MOU expiry in ${mou.days_left} days`;
        const message = `${mou.college_name} MOU expires on ${mou.valid_upto}.`;
        await connection.execute(
          `INSERT IGNORE INTO notifications (mou_id,user_id,title,message,type,reminder_key) VALUES (?,?,?,?,?,?)`,
          [mou.id, user.id, title, message, 'Expiry', `mou:${mou.id}:${mou.days_left}`]
        );
      }
    }

    for (const project of projects) {
      for (const user of users) {
        const title = `Project deadline in ${project.days_left} days`;
        const message = `${project.title} for ${project.college_name} ends on ${project.end_date}.`;
        await connection.execute('INSERT IGNORE INTO notifications (mou_id,user_id,title,message,type,reminder_key) VALUES (?,?,?,?,?,?)', [project.mou_id, user.id, title, message, 'Project Expiry', `project:${project.id}:${project.days_left}`]);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('Expiry reminder job failed:', error.message);
  } finally {
    connection.release();
  }
};

const startExpiryReminderJob = () => {
  cron.schedule('0 9 * * *', runExpiryReminderJob);
  runExpiryReminderJob();
};

module.exports = { startExpiryReminderJob, runExpiryReminderJob };
