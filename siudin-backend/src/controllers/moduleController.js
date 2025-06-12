// src/controllers/moduleController.js
const supabase = require('../config/database');
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
  try {
    const userId = req.user.id;

    // Fetch user's completed modules
    const { data: userCompletedModulesRaw, error: completedModulesError } = await supabase
      .from('user_progress')
      .select(`
        module_id,
        modules(id, title, topic, difficulty, class_level)
      `)
      .eq('user_id', userId)
      .eq('is_completed', true)
      .order('completed_at', { ascending: false })
      .limit(5);

    if (completedModulesError) throw completedModulesError;

    // Format the fetched data to directly get module details
    const formattedCompletedModules = userCompletedModulesRaw.map(up => up.modules);

    let recommendedModules = [];
    // Declare completedIds in a broader scope, and ensure its elements are strings for robustness
    let completedIds = new Set(formattedCompletedModules.map(m => String(m.id)));


    if (formattedCompletedModules.length > 0) {
      try {
        console.log('🔍 Attempting ML recommendations...');

        const userProfileText = formattedCompletedModules
          .map(m => `${m.topic} ${m.class_level} ${m.difficulty}`)
          .join(' ');

        // Fetch all modules
        const { data: allModules, error: allModulesError } = await supabase
          .from('modules')
          .select('id, title, description, video_url, difficulty, class_level, topic');

        if (allModulesError) throw allModulesError;

        const uncompletedModules = allModules.filter(m => !completedIds.has(String(m.id))); // Filter using string IDs

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

      let queryBuilder = supabase
        .from('modules')
        .select('id, title, description, video_url, difficulty, class_level, topic');

      const completedIdsArray = Array.from(completedIds); // Convert Set to Array

      // Apply the 'not.in' filter only if there are completed IDs
      if (completedIdsArray.length > 0) {
          // Supabase's 'in' operator can take an array.
          // The error "unexpected "1" expecting "(" is unusual, but directly passing the array should be correct.
          // If the error persists, it might imply a very specific bug or version issue with Supabase client/PostgREST.
          // Ensure the 'id' column in your 'modules' table is of a compatible type (e.g., INT or UUID).
          queryBuilder = queryBuilder.not('id', 'in', completedIdsArray);
      }

      if (formattedCompletedModules.length > 0) {
        const primaryTopic = formattedCompletedModules[0].topic;
        queryBuilder = queryBuilder.eq('topic', primaryTopic).order('id', { ascending: false }).limit(5);
      } else {
        queryBuilder = queryBuilder.order('id', { ascending: false }).limit(5); // Default fallback if no completed modules
      }

      const { data: fallbackModules, error: fallbackError } = await queryBuilder;
      if (fallbackError) throw fallbackError;
      recommendedModules = fallbackModules;
    }

    res.status(200).json(recommendedModules);
  } catch (error) {
    console.error(' Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error getting recommendations.' });
  }
};

const getAllModules = async (req, res) => {
  try {
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*');

    if (error) {
      console.error('Error getting modules:', error);
      return res.status(500).json({ message: 'Server error getting modules.' });
    }
    res.status(200).json(modules);
  } catch (error) {
    console.error('Error getting modules:', error);
    res.status(500).json({ message: 'Server error getting modules.' });
  }
};

const getModuleById = async (req, res) => {
  try {
    const { data: module, error } = await supabase
      .from('modules')
      .select('*')
      .eq('id', req.params.id)
      .limit(1);

    if (error) {
      console.error('Error getting module by ID:', error);
      return res.status(500).json({ message: 'Server error getting module.' });
    }

    if (!module || module.length === 0) {
      return res.status(404).json({ message: 'Module not found' });
    }
    res.status(200).json(module[0]);
  } catch (error) {
    console.error('Error getting module by ID:', error);
    res.status(500).json({ message: 'Server error getting module.' });
  }
};


module.exports = {
  getAllModules,
  getModuleById,
  getRecommendedModules,
};