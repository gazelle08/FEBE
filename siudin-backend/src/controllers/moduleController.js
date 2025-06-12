// src/controllers/moduleController.js
const supabase = require('../config/database'); // Use Supabase client
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
    const { data: userCompletedModules, error: completedModulesError } = await supabase
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

    const formattedCompletedModules = userCompletedModules.map(up => up.modules);

    let recommendedModules = [];

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

        const completedIds = new Set(formattedCompletedModules.map(m => m.id));
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

      let query = supabase
        .from('modules')
        .select('id, title, description, video_url, difficulty, class_level, topic')
        .not('id', 'in', Array.from(completedIds || [])); // Exclude already completed modules

      if (formattedCompletedModules.length > 0) {
        const primaryTopic = formattedCompletedModules[0].topic;
        query = query.eq('topic', primaryTopic).order('id', { ascending: false }).limit(5); // Order by id then limit
      } else {
        query = query.order('id', { ascending: false }).limit(5); // Just random for a general user
      }

      const { data: fallbackModules, error: fallbackError } = await query;
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
    // Fetch all modules
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
    // Fetch module by ID
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