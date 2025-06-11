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

    let importedCount = 0;
    for (const record of records) {
      const jenjang = record['Jenjang'];
      const mataPelajaran = record['Mata Pelajaran'];
      const materi = record['Materi'];
      const subMateri = record['Sub Materi'];
      const link = record['Link'];
      
      const combinedQuestionAndAnswerText = record['Pertanyaan'] || null;
      let actualQuestionsText = null;
      let rawAnswerKeysText = null; 

      if (combinedQuestionAndAnswerText) {
          const parts = combinedQuestionAndAnswerText.split('Kunci Jawaban:');
          actualQuestionsText = parts[0] ? parts[0].trim() : null;
          rawAnswerKeysText = parts[1] ? parts[1].trim() : null;
      }

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

      const mlFeatures = null; 

      const moduleInsertQuery = `
        INSERT INTO modules (title, description, video_url, difficulty, class_level, topic, ml_features, questions_text, answer_key_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          description = VALUES(description),
          video_url = VALUES(video_url),
          difficulty = VALUES(difficulty),
          class_level = VALUES(class_level),
          topic = VALUES(topic),
          ml_features = VALUES(ml_features),
          questions_text = VALUES(questions_text),
          answer_key_text = VALUES(answer_key_text);
      `;
      const [moduleResult] = await connection.execute(moduleInsertQuery, [
        title,
        description,
        videoUrl,
        difficulty,
        classLevel,
        topic,
        mlFeatures ? JSON.stringify(mlFeatures) : null,
        actualQuestionsText, 
        rawAnswerKeysText 
      ]);

      let moduleId = moduleResult.insertId;
      if (moduleResult.affectedRows === 0 && moduleResult.warningStatus === 0) {
          const [existingModule] = await connection.execute('SELECT id FROM modules WHERE title = ?', [title]);
          if (existingModule.length > 0) {
              moduleId = existingModule[0].id;
          } else {
              console.warn(`Could not retrieve module_id for module: ${title}. Skipping quiz import for this module.`);
              continue;
          }
      }


      if (actualQuestionsText && rawAnswerKeysText) {
        try {
          const questionsArray = actualQuestionsText.split(/\n\s*(?=\d+\.\s*)/).filter(q => q.trim() !== '');
          
          const answerKeyLetters = rawAnswerKeysText.split('\n').map(a => {
            const match = a.trim().match(/^[a-d]/i); 
            return match ? match[0].toLowerCase() : null;
          }).filter(Boolean); 

          for (let i = 0; i < questionsArray.length; i++) {
            const fullQuestionText = questionsArray[i].trim();
            
            let currentOptions = [];
            let questionOnly = fullQuestionText;
            
            const optionsRegex = /[a-d]\.\s*([^\n]+)/g;
            let match;

            const tempQuestionWithOptions = fullQuestionText;
            const localOptionsRegex = new RegExp(optionsRegex); 
            while ((match = localOptionsRegex.exec(tempQuestionWithOptions)) !== null) {
                currentOptions.push(match[1].trim()); 
            }

            questionOnly = fullQuestionText.replace(optionsRegex, '').replace(/^\d+\.\s*/, '').trim();

            let correctAnswerText = null;
            const correctLetter = answerKeyLetters[i];
            if (correctLetter) {
                const optionIndex = correctLetter.charCodeAt(0) - 'a'.charCodeAt(0);
                if (optionIndex >= 0 && optionIndex < currentOptions.length) {
                    correctAnswerText = currentOptions[optionIndex]; 
                }
            }
            
            const quizXpReward = 10; 

            const quizInsertQuery = `
              INSERT INTO quizzes (module_id, question, options, correct_answer, xp_reward)
              VALUES (?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                question = VALUES(question),
                options = VALUES(options),
                correct_answer = VALUES(correct_answer),
                xp_reward = VALUES(xp_reward);
            `;

            await connection.execute(quizInsertQuery, [
              moduleId, 
              questionOnly,
              JSON.stringify(currentOptions), 
              correctAnswerText,
              quizXpReward
            ]);
            console.log(`    Successfully inserted quiz ${i + 1} for module ID ${moduleId} (${title})`);
          }
        } catch (parseError) {
          console.warn(`Warning: Could not parse quizzes for module: ${title}. Error: ${parseError.message}`);
        }
      }
      importedCount++;
    }

    await connection.commit();
    console.log('Verifying data count after commit...');
    const [moduleCountRows] = await connection.execute('SELECT COUNT(*) AS count FROM modules;');
    const moduleCount = moduleCountRows[0].count;
    const [quizCountRows] = await connection.execute('SELECT COUNT(*) AS count FROM quizzes;');
    const quizCount = quizCountRows[0].count;
    console.log(`Current modules count: ${moduleCount}`);
    console.log(`Current quizzes count: ${quizCount}`);
    console.log(`Successfully imported ${importedCount} records into modules and quizzes tables.`);
  } catch (error) {
    if (connection) {
      await connection.rollback();
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