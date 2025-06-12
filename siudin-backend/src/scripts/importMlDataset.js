// src/scripts/importMlDataset.js
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');
const supabase = require('../config/database'); 
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const csvFilePath = path.resolve(__dirname, 'Dataset SIUDIN - Final.csv');

async function importMlDataset() {
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

    let importedModulesCount = 0;
    let importedQuizzesCount = 0;

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

      const { data: moduleData, error: moduleError } = await supabase
        .from('modules')
        .upsert({
          title: title,
          description: description,
          video_url: videoUrl,
          difficulty: difficulty,
          class_level: classLevel,
          topic: topic,
          ml_features: mlFeatures ? JSON.stringify(mlFeatures) : null,
          questions_text: actualQuestionsText,
          answer_key_text: rawAnswerKeysText
        }, { onConflict: 'title' }) 
        .select('id'); 

      if (moduleError) {
        console.warn(`Warning: Could not upsert module: ${title}. Error: ${moduleError.message}`);
        continue;
      }

      const moduleId = moduleData && moduleData.length > 0 ? moduleData[0].id : null;

      if (!moduleId) {
          console.warn(`Could not retrieve module_id for module: ${title}. Skipping quiz import for this module.`);
          continue;
      }
      importedModulesCount++;


      // Insert quizzes if available
      if (actualQuestionsText && rawAnswerKeysText) {
        try {
          const questionsArray = actualQuestionsText.split(/\n\s*(?=\d+\.\s*)/).filter(q => q.trim() !== '');

          const answerKeyLetters = rawAnswerKeysText.split('\n').map(a => {
            const match = a.trim().match(/^[a-d]/i);
            return match ? match[0].toLowerCase() : null;
          }).filter(Boolean);

          const quizzesToInsert = [];
          for (let i = 0; i < questionsArray.length; i++) {
            const fullQuestionText = questionsArray[i].trim();

            let currentOptions = [];
            const optionsRegex = /[a-d]\.\s*([^\n]+)/g;
            let match;

            const tempQuestionWithOptions = fullQuestionText;
            const localOptionsRegex = new RegExp(optionsRegex);
            while ((match = localOptionsRegex.exec(tempQuestionWithOptions)) !== null) {
                currentOptions.push(match[1].trim());
            }

            const questionOnly = fullQuestionText.replace(optionsRegex, '').replace(/^\d+\.\s*/, '').trim();

            let correctAnswerText = null;
            const correctLetter = answerKeyLetters[i];
            if (correctLetter) {
                const optionIndex = correctLetter.charCodeAt(0) - 'a'.charCodeAt(0);
                if (optionIndex >= 0 && optionIndex < currentOptions.length) {
                    correctAnswerText = currentOptions[optionIndex];
                }
            }

            const quizXpReward = 10;

            quizzesToInsert.push({
              module_id: moduleId,
              question: questionOnly,
              options: JSON.stringify(currentOptions), 
              correct_answer: correctAnswerText,
              xp_reward: quizXpReward
            });
          }

          const { data: quizInsertData, error: quizInsertError } = await supabase
            .from('quizzes')
            .insert(quizzesToInsert);

          if (quizInsertError) {
            console.warn(`Warning: Could not insert quizzes for module: ${title}. Error: ${quizInsertError.message}`);
          } else {
            importedQuizzesCount += quizzesToInsert.length;
            console.log(`    Successfully inserted ${quizzesToInsert.length} quizzes for module ID ${moduleId} (${title})`);
          }

        } catch (parseError) {
          console.warn(`Warning: Could not parse quizzes for module: ${title}. Error: ${parseError.message}`);
        }
      }
    }

    console.log(`Successfully imported ${importedModulesCount} modules.`);
    console.log(`Successfully imported ${importedQuizzesCount} quizzes.`);

    const { count: moduleCount, error: moduleCountError } = await supabase.from('modules').select('*', { count: 'exact' });
    const { count: quizCount, error: quizCountError } = await supabase.from('quizzes').select('*', { count: 'exact' });

    if (moduleCountError) console.error('Error fetching modules count:', moduleCountError);
    if (quizCountError) console.error('Error fetching quizzes count:', quizCountError);

    console.log(`Current modules count: ${moduleCount}`);
    console.log(`Current quizzes count: ${quizCount}`);

  } catch (error) {
    console.error('Error importing ML dataset:', error);
  } finally {
    process.exit(0);
  }
}

importMlDataset();