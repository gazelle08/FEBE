// src/scripts/importMlDataset.js
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const csvFilePath = path.resolve(__dirname, 'Dataset SIUDIN - Final.csv');

async function importMlDataset() {
  console.log(`Starting import from: ${csvFilePath}`);
  let connection;
  try {
    connection = await db.getConnection();
    console.log('Database connection tested successfully.');

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
    console.log('Transaction started.');

    let insertedCount = 0;
    for (const record of records) {
      const jenjang = record['Jenjang'];
      const mataPelajaran = record['Mata Pelajaran'];
      const materi = record['Materi'];
      const subMateri = record['Sub Materi'];
      const link = record['Link'];

      // Derived fields
      const title = `${mataPelajaran} - ${materi} (${subMateri})`;
      const description = `Materi pembelajaran ${materi} dengan sub-materi ${subMateri}.`;
      const videoUrl = link || null;
      const classLevel = jenjang;
      const topic = mataPelajaran;

      let difficulty;
      const parsedJenjang = parseInt(jenjang, 10);
      if (isNaN(parsedJenjang)) {
        difficulty = 'Unknown';
      } else if (parsedJenjang >= 7 && parsedJenjang <= 8) {
        difficulty = 'Easy';
      } else if (parsedJenjang >= 9 && parsedJenjang <= 11) {
        difficulty = 'Medium';
      } else if (parsedJenjang === 12) {
        difficulty = 'Hard';
      } else {
        difficulty = 'Unknown';
      }

      // --- PERSIAPAN UNTUK 'ml_features' ---
      // Saat ini 'ml_features' akan tetap null karena tidak ada di CSV yang diberikan.
      // Jika tim ML menambahkan kolom 'ml_features' (misalnya, sebagai string JSON)
      // ke CSV di masa depan, Anda bisa membaca kolom tersebut di sini:
      // const mlFeaturesRaw = record['Nama_Kolom_ML_Features_Baru_Dari_CSV'];
      // let mlFeatures = null;
      // try {
      //   if (mlFeaturesRaw) {
      //     mlFeatures = JSON.parse(mlFeaturesRaw);
      //   }
      // } catch (jsonError) {
      //   console.warn(`Warning: Could not parse ml_features for module: ${title}. Error: ${jsonError.message}`);
      //   mlFeatures = null;
      // }
      const mlFeatures = null;

      const query = `
        INSERT INTO modules (title, description, video_url, difficulty, class_level, topic, ml_features)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          difficulty = VALUES(difficulty),
          class_level = VALUES(class_level),
          topic = VALUES(topic),
          ml_features = VALUES(ml_features);
      `;

      await connection.execute(query, [
        title,
        description,
        videoUrl,
        difficulty,
        classLevel,
        topic,
        mlFeatures ? JSON.stringify(mlFeatures) : null
      ]);
      insertedCount++;
    }

    await connection.commit();
    console.log(`Successfully imported ${insertedCount} records into modules table.`);
  } catch (error) {
    if (connection) {
      await connection.rollback();
      console.error('Rolling back transaction.');
    }
    console.error('Error importing ML dataset:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

importMlDataset();