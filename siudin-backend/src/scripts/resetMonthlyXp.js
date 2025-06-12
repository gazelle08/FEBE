// src/scripts/resetMonthlyXp.js
const supabase = require('../config/database'); 
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function resetMonthlyXp() {
  try {
    console.log('Connecting to Supabase for monthly XP reset.');

    const { data, error } = await supabase
      .from('users')
      .update({ xp_this_month: 0 });

    if (error) {
      console.error('Error resetting monthly XP:', error);
      throw error;
    }

    console.log(`Successfully reset xp_this_month for users.`);
  } catch (error) {
    console.error('Error resetting monthly XP:', error);
  } finally {
    process.exit(0);
  }
}

resetMonthlyXp();