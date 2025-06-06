// src/scripts/resetMonthlyXp.js
const db = require('../config/database');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function resetMonthlyXp() {
  let connection;
  try {
    connection = await db.getConnection();
    console.log('Connected to database for monthly XP reset.');

    const [result] = await connection.execute('UPDATE users SET xp_this_month = 0');
    console.log(`Successfully reset xp_this_month for ${result.affectedRows} users.`);
  } catch (error) {
    console.error('Error resetting monthly XP:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

resetMonthlyXp();