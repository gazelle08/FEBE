// src/scripts/importMissionDataset.js
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');
const supabase = require('../config/database'); 
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const csvFilePath = path.resolve(__dirname, 'Dataset SIUDIN - Misi.csv');

async function importMissionDataset() {
  console.log(`Starting import from: ${csvFilePath}`);

  try {

    const records = [];
    const parser = fs
      .createReadStream(csvFilePath)
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      }));

    for await (const record of parser) {
      records.push(record);
    }

    console.log(`Found ${records.length} records in CSV.`);

    if (records.length === 0) {
      console.log('No records found in CSV. Exiting.');
      process.exit(0);
    }

    const missionsToInsert = [];
    for (const record of records) {
      const missionId = parseInt(record['No'], 10);
      const missionTitle = record['Misi'];
      const xpReward = parseInt(record['XP'], 10) || 0;
      const targetValue = parseInt(record['Target'], 10) || 1;
      const type = record['Type'] || 'watch_video';
      const badgeReward = record['Badge Reward'] || null;
      const description = `Selesaikan misi: ${missionTitle}.`;

      if (isNaN(xpReward) || isNaN(targetValue) || isNaN(missionId)) {
        console.warn(`Skipping record due to invalid ID, XP or Target: ${JSON.stringify(record)}`);
        continue;
      }

      missionsToInsert.push({
        id: missionId,
        title: missionTitle,
        description: description,
        xp_reward: xpReward,
        badge_reward: badgeReward,
        type: type,
        required_completion_count: targetValue
      });
    }

    const { data, error } = await supabase
      .from('missions')
      .upsert(missionsToInsert, { onConflict: 'id' });
    if (error) {
      console.error('Error inserting missions:', error);
      throw error;
    }

    console.log(`Successfully imported ${missionsToInsert.length} records into missions table.`);
  } catch (error) {
    console.error('Error importing Mission dataset:', error);
  } finally {
    process.exit(0);
  }
}

importMissionDataset();