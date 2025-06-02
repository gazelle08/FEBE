// src/controllers/moduleController.js
const db = require('../config/database');
const axios = require('axios'); // For ML model API call (if applicable)

const getAllModules = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const { difficulty, class_level, topic } = req.query;

    let query = 'SELECT id, title, description, video_url, difficulty, class_level, topic FROM modules WHERE 1=1';
    const params = [];

    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }
    if (class_level) {
      query += ' AND class_level = ?';
      params.push(class_level);
    }
    if (topic) {
      query += ' AND topic = ?';
      params.push(topic);
    }

    query += ' ORDER BY title ASC';

    const [modules] = await connection.execute(query, params);
    res.status(200).json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ message: 'Server error fetching modules.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getModuleById = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const { id } = req.params;
    const [modules] = await connection.execute('SELECT id, title, description, video_url, difficulty, class_level, topic FROM modules WHERE id = ?', [id]);
    const module = modules[0];

    if (!module) {
      return res.status(404).json({ message: 'Module not found.' });
    }
    res.status(200).json(module);
  } catch (error) {
    console.error('Error fetching module by ID:', error);
    res.status(500).json({ message: 'Server error fetching module.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const createModule = async (req, res) => {
  const { title, description, video_url, difficulty, class_level, topic, ml_features } = req.body;

  if (!title || !description || !video_url || !difficulty || !class_level || !topic) {
    return res.status(400).json({ message: 'All module fields (title, description, video_url, difficulty, class_level, topic) are required.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [result] = await connection.execute(
      'INSERT INTO modules (title, description, video_url, difficulty, class_level, topic, ml_features) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, video_url, difficulty, class_level, topic, ml_features ? JSON.stringify(ml_features) : null]
    );
    res.status(201).json({ message: 'Module created successfully.', moduleId: result.insertId });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ message: 'Server error creating module.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const updateModule = async (req, res) => {
  const { id } = req.params;
  const { title, description, video_url, difficulty, class_level, topic, ml_features } = req.body;

  if (!title && !description && !video_url && !difficulty && !class_level && !topic && ml_features === undefined) {
    return res.status(400).json({ message: 'At least one field (title, description, video_url, difficulty, class_level, topic, or ml_features) is required for update.' });
  }

  const fieldsToUpdate = [];
  const params = [];

  if (title) { fieldsToUpdate.push('title = ?'); params.push(title); }
  if (description) { fieldsToUpdate.push('description = ?'); params.push(description); }
  if (video_url) { fieldsToUpdate.push('video_url = ?'); params.push(video_url); }
  if (difficulty) { fieldsToUpdate.push('difficulty = ?'); params.push(difficulty); }
  if (class_level) { fieldsToUpdate.push('class_level = ?'); params.push(class_level); }
  if (topic) { fieldsToUpdate.push('topic = ?'); params.push(topic); }
  if (ml_features !== undefined) { fieldsToUpdate.push('ml_features = ?'); params.push(ml_features ? JSON.stringify(ml_features) : null); } // Store as JSON string or null

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  params.push(id);

  let connection;
  try {
    connection = await db.getConnection();
    const query = `UPDATE modules SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
    const [result] = await connection.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Module not found or no changes made.' });
    }
    res.status(200).json({ message: 'Module updated successfully.' });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ message: 'Server error updating module.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const deleteModule = async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    const [result] = await connection.execute('DELETE FROM modules WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Module not found.' });
    }
    res.status(200).json({ message: 'Module deleted successfully.' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ message: 'Server error deleting module.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getRecommendedModules = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user.id;

    // Fetch user's recently completed modules (topics, difficulty, class_level)
    const [userCompletedModules] = await connection.execute(`
      SELECT m.id, m.topic, m.difficulty, m.class_level
      FROM user_progress up
      JOIN modules m ON up.module_id = m.id
      WHERE up.user_id = ? AND up.is_completed = TRUE
      ORDER BY up.completed_at DESC
      LIMIT 5;
    `, [userId]);

    let recommendedModules = [];

    // Prioritize ML model recommendations if available and configured
    if (userCompletedModules.length > 0 && process.env.ML_MODEL_API_URL) {
      try {
        console.log('Calling ML model API for recommendations...');
        const mlResponse = await axios.post(process.env.ML_MODEL_API_URL, {
          user_id: userId,
          completed_modules: userCompletedModules.map(m => ({
            id: m.id,
            topic: m.topic,
            difficulty: m.difficulty,
            class_level: m.class_level
          }))
        });

        const recommendedModuleIds = mlResponse.data.recommendations;

        if (recommendedModuleIds && recommendedModuleIds.length > 0) {
          // Filter out modules already completed by the user
          const placeHolders = recommendedModuleIds.map(() => '?').join(',');
          const [modulesFromMl] = await connection.execute(`
            SELECT id, title, description, video_url, difficulty, class_level, topic FROM modules
            WHERE id IN (${placeHolders}) AND id NOT IN (SELECT module_id FROM user_progress WHERE user_id = ? AND is_completed = TRUE)
            LIMIT 5;
          `, [...recommendedModuleIds, userId]);
          recommendedModules = modulesFromMl;
          console.log(`ML model recommended ${recommendedModules.length} modules.`);
        }
      } catch (mlError) {
        console.error('Error calling ML model API:', mlError.message);
        console.log('Falling back to database-based recommendations.');
      }
    }

    // Fallback to database-based recommendations if ML model failed or returned no results
    if (recommendedModules.length === 0) {
      let query = `
        SELECT m.id, m.title, m.description, m.video_url, m.difficulty, m.class_level, m.topic
        FROM modules m
        LEFT JOIN user_progress up ON m.id = up.module_id AND up.user_id = ?
        WHERE up.module_id IS NULL `; // Ensure module is not already completed
      const queryParams = [userId];

      if (userCompletedModules.length > 0) {
        // Recommend based on recent completed module's topic and difficulty
        const primaryTopic = userCompletedModules[0].topic;
        const primaryDifficulty = userCompletedModules[0].difficulty;
        const primaryClassLevel = userCompletedModules[0].class_level;

        query += `AND (m.topic = ? OR m.difficulty = ? OR m.class_level = ?) `;
        queryParams.push(primaryTopic, primaryDifficulty, primaryClassLevel);
      }

      query += `ORDER BY RAND() LIMIT 5;`; // Get random uncompleted modules, prioritizing by topic/difficulty if available

      const [fallbackModules] = await connection.execute(query, queryParams);
      recommendedModules = fallbackModules;
      console.log(`Fallback recommendations: ${recommendedModules.length} modules.`);
    }

    res.status(200).json(recommendedModules);

  } catch (error) {
    console.error('Error getting recommended modules:', error);
    res.status(500).json({ message: 'Server error getting recommendations.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


module.exports = {
  getAllModules,
  getModuleById,
  createModule,
  updateModule,
  deleteModule,
  getRecommendedModules,
};