// src/scripts/importMlDataset.js
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');
const db = require('../config/database');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); // Pastikan .env terload

// PASTIKAN UNTUK MENYESUAIKAN PATH FILE CSV ANDA DI SINI
// Contoh: jika file CSV Anda ada di root folder proyek (di luar siudin-backend/src)
const csvFilePath = path.resolve(__dirname, 'Dataset SIUDIN - Final.csv');
// Jika file CSV ada di folder siudin-backend/src/scripts:
// const csvFilePath = path.resolve(__dirname, './Dataset SIUDIN.xlsx - Final.csv');


async function importMlDataset() {
  console.log(`Starting import from: ${csvFilePath}`);
  try {
    // Memastikan koneksi database aktif sebelum memulai import
    await db.getConnection();
    console.log('Database connection tested successfully.');

    const records = [];
    const parser = fs
      .createReadStream(csvFilePath)
      .pipe(parse({
        columns: true, // Treat the first row as column names (headers)
        skip_empty_lines: true,
        trim: true // Trim whitespace from values
      }));

    for await (const record of parser) {
      records.push(record);
    }

    console.log(`Found ${records.length} records in CSV.`);

    if (records.length === 0) {
      console.log('No records found in CSV. Exiting.');
      process.exit(0);
    }

    // Start a transaction for bulk insert
    await db.beginTransaction();
    console.log('Transaction started.');

    let insertedCount = 0;
    for (const record of records) {
      // --- SESUAIKAN BAGIAN INI DENGAN STRUKTUR KOLOM CSV DAN TABEL MYSQL ANDA ---
      // Sesuaikan dengan kolom di Dataset SIUDIN.xlsx - Final.csv
      const {
        'id': moduleId, // Asumsi kolom ID modul di CSV bernama 'id'
        'Title': title,
        'Description': description,
        'Difficulty': difficulty,
        'Topic': topic,
        'Class Level': classLevel, // Perhatikan spasi di nama kolom
        'Video URL': videoUrl, // Jika ada kolom video URL di CSV
        'ML_Features': mlFeaturesJson // Kolom yang mungkin berisi string JSON
      } = record;

      // Periksa apakah moduleId ada dan valid (numeric)
      const parsedModuleId = parseInt(moduleId, 10);
      if (isNaN(parsedModuleId)) {
          console.warn(`Skipping record due to invalid Module ID: ${moduleId}. Record:`, record);
          continue; // Skip this record
      }

      // Konversi ml_features dari string JSON ke objek JavaScript (jika ada)
      let parsedMlFeatures = null;
      try {
        if (mlFeaturesJson) {
          parsedMlFeatures = JSON.parse(mlFeaturesJson);
        }
      } catch (jsonError) {
        console.warn(`Warning: Could not parse ml_features for module_id ${moduleId}. Error: ${jsonError.message}`);
        parsedMlFeatures = null; // Set to null if parsing fails
      }

      // Query untuk modules. Menggunakan INSERT ... ON DUPLICATE KEY UPDATE
      const query = `
        INSERT INTO modules (id, title, description, video_url, difficulty, class_level, topic, ml_features)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          video_url = VALUES(video_url),
          difficulty = VALUES(difficulty),
          class_level = VALUES(class_level),
          topic = VALUES(topic),
          ml_features = VALUES(ml_features);
      `;

      // Pastikan urutan dan jumlah parameter sesuai dengan query Anda
      await db.execute(query, [
        parsedModuleId,
        title,
        description,
        videoUrl || 'N/A', // Gunakan nilai dari CSV atau 'N/A' jika tidak ada
        difficulty,
        classLevel,
        topic,
        parsedMlFeatures ? JSON.stringify(parsedMlFeatures) : null // Simpan sebagai string JSON atau null
      ]);
      insertedCount++;
    }

    await db.commit();
    console.log(`Successfully imported ${insertedCount} records into modules table.`);
  } catch (error) {
    await db.rollback();
    console.error('Error importing ML dataset:', error);
    console.error('Rolling back transaction.');
  } finally {
    process.exit(0); // Exit the script after completion
  }
}

importMlDataset();