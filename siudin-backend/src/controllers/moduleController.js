// src/controllers/moduleController.js
const db = require('../config/database');
const tf = require('@tensorflow/tfjs'); 
const ModelLoader = require('../ml/models/recommender/model_loader'); 
const preprocessor = require('../ml/models/recommender/preprocessor'); 

function calculateSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  return normA && normB ? dotProduct / (normA * normB) : 0;
}

const getRecommendedModules = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;

    const [userCompletedModules] = await connection.execute(`
      SELECT m.id, m.title, m.topic, m.difficulty, m.class_level 
      FROM user_progress up
      JOIN modules m ON up.module_id = m.id
      WHERE up.user_id = ? AND up.is_completed = TRUE
      ORDER BY up.completed_at DESC
      LIMIT 5
    `, [userId]);

    let recommendedModules = [];

    if (userCompletedModules.length > 0) {
      try {
        console.log('🔍 Attempting ML recommendations...');
        
        const userProfileText = userCompletedModules
          .map(m => `${m.topic} ${m.class_level} ${m.difficulty}`)
          .join(' ');
        
        const [allModules] = await connection.execute(`
          SELECT id, title, description, video_url, difficulty, class_level, topic
          FROM modules
        `);
        
        const completedIds = new Set(userCompletedModules.map(m => m.id));
        const uncompletedModules = allModules.filter(m => !completedIds.has(m.id));
        
        if (uncompletedModules.length > 0) {
          if (!ModelLoader.model && !ModelLoader.isLoading) {
            console.warn('ML model not yet loaded, attempting to load for first prediction.');
            await ModelLoader.load(); 
          }

          if (ModelLoader.model) { 
            const batchSize = 10; 
            const moduleScores = [];
            
            const userEmbedding = await ModelLoader.predict(userProfileText);
            const userEmbeddingArray = Array.from(userEmbedding); 

            for (let i = 0; i < uncompletedModules.length; i += batchSize) {
              const batch = uncompletedModules.slice(i, i + batchSize);
              
              const moduleEmbeddingsPromises = batch.map(async (moduleItem) => {
                const moduleText = `${moduleItem.topic} ${moduleItem.class_level} ${moduleItem.difficulty}`;
                return await ModelLoader.predict(moduleText);
              });
              
              const batchModuleEmbeddings = await Promise.all(moduleEmbeddingsPromises);
              
              batch.forEach((moduleItem, idx) => {
                const moduleEmbeddingArray = Array.from(batchModuleEmbeddings[idx]);
                const similarity = calculateSimilarity(userEmbeddingArray, moduleEmbeddingArray);
                moduleScores.push({
                  module: moduleItem,
                  similarity: similarity
                });
              });
            }
            
            moduleScores.sort((a, b) => b.similarity - a.similarity);
            recommendedModules = moduleScores
              .slice(0, 5)
              .map(item => ({
                ...item.module,
                similarity: item.similarity
              }));
              
            console.log(' ML recommendations generated');
          } else {
            console.warn('ML model failed to load. Falling back to non-ML recommendations.');
          }
        }
      } catch (mlError) {
        console.error(' ML recommendation error:', mlError);
      }
    }

    if (recommendedModules.length === 0) {
      console.log('Using fallback recommendations');
      
      let query = `
        SELECT m.id, m.title, m.description, m.video_url, 
               m.difficulty, m.class_level, m.topic
        FROM modules m
        LEFT JOIN user_progress up ON m.id = up.module_id AND up.user_id = ?
        WHERE up.module_id IS NULL `;
      
      const queryParams = [userId];

      if (userCompletedModules.length > 0) {
        const primaryTopic = userCompletedModules[0].topic;
        query += `AND m.topic = ? ORDER BY RAND() LIMIT 5`;
        queryParams.push(primaryTopic);
      } else {
        query += `ORDER BY RAND() LIMIT 5`;
      }

      const [fallbackModules] = await connection.execute(query, queryParams);
      recommendedModules = fallbackModules;
    }

    res.status(200).json(recommendedModules);
  } catch (error) {
    console.error(' Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error getting recommendations.' });
  } finally {
    if (connection) connection.release();
  }
};

const getAllModules = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [modules] = await connection.execute('SELECT * FROM modules');
    res.status(200).json(modules);
  } catch (error) {
    res.status(500).json({ message: 'Server error getting modules.' });
  } finally {
    if (connection) connection.release();
  }
};

const getModuleById = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [module] = await connection.execute('SELECT * FROM modules WHERE id = ?', [req.params.id]);
    if (module.length === 0) {
      return res.status(404).json({ message: 'Module not found' });
    }
    res.status(200).json(module[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error getting module.' });
  } finally {
    if (connection) connection.release();
  }
};


module.exports = {
  getAllModules,
  getModuleById,
  getRecommendedModules,
};