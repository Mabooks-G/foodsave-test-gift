// checkExpiry.js
import pool from './db.js'; // your DB connection

async function checkExpiry() {
  try {
    const result = await pool.query(
      'SELECT stakeholderid, fooditemid, name, expirydate FROM fooditemdb'
    );

    const today = new Date();

    for (const item of result.rows) {
      const expDate = new Date(item.expirydate);
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

      if (diffDays <= 2) {
        // Reset notificationRead so frontend sees it as new
        await pool.query(
          'UPDATE fooditemdb SET "notificationRead" = false WHERE fooditemid = $1',
          [item.fooditemid]
        );

        console.log(`Notification reset for ${item.stakeholderid}: ${item.name}`);
      }
    }
  } catch (err) {
    console.error('Error checking expiry:', err);
  } finally {
    pool.end(); // close DB connection
  }
}

checkExpiry();
