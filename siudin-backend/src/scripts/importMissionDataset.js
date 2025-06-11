// src/scripts/importMissionDataset.js
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const csvFilePath = path.resolve(__dirname, 'Dataset SIUDIN - Misi.csv');

async function importMissionDataset() {
  console.log(`Starting import from: ${csvFilePath}`);
  let connection;
  try {
    connection = await db.getConnection();
    console.log('Database connection tested successfully.');

    await connection.execute('SET FOREIGN_KEY_CHECKS = 0;');
    console.log('Foreign key checks temporarily disabled.');

    console.log('Truncating existing missions data...');
    await connection.execute('TRUNCATE TABLE missions');
    console.log('missions data truncated.');

    await connection.execute('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('Foreign key checks re-enabled.');

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

    await connection.beginTransaction();
    console.log('Transaction started for new import.');

    let insertedCount = 0;
    for (const record of records) {
      const missionTitle = record['Misi'];
      const xpReward = parseInt(record['XP'], 10) || 0;
      const targetValue = parseInt(record['Target'], 10) || 1;
      const type = record['Type'] || 'watch_video';
      const badgeReward = record['Badge Reward'] || null;


      const description = `Selesaikan misi: ${missionTitle}.`;

      if (isNaN(xpReward) || isNaN(targetValue)) {
        console.warn(`Skipping record due to invalid XP or Target: ${JSON.stringify(record)}`);
        continue;
      }
      const missionId = parseInt(record['No'], 10);
      if (isNaN(missionId)) {
        console.warn(`Skipping record due to invalid Mission ID: ${JSON.stringify(record)}`);
        continue;
      }

      const query = `
                INSERT INTO missions (id, title, description, xp_reward, badge_reward, type, required_completion_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    description = VALUES(description),
                    xp_reward = VALUES(xp_reward),
                    badge_reward = VALUES(badge_reward),
                    type = VALUES(type),
                    required_completion_count = VALUES(required_completion_count);
            `;

      await connection.execute(query, [
        missionId,
        missionTitle,
        description,
        xpReward,
        badgeReward,
        type,
        targetValue
      ]);
      insertedCount++;
    }

    await connection.commit();
    console.log(`Successfully imported ${insertedCount} records into missions table.`);
  } catch (error) {
    if (connection) {
        try {
            await connection.execute('SET FOREIGN_KEY_CHECKS = 1;');
            console.log('Foreign key checks re-enabled after error.');
        } catch (fkErr) {
            console.error('Error re-enabling foreign key checks:', fkErr);
        }
        await connection.rollback();
    }
    console.error('Error importing Mission dataset:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

importMissionDataset();