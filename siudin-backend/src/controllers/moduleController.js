// src/controllers/moduleController.js
const db = require('../config/database');
const axios = require('axios'); // For ML model API call (if applicable)

const getAllModules = async (req, res) => {
  try {
    const { difficulty, class_level, topic } = req.query; // Ambil query parameters

    let query = 'SELECT * FROM modules WHERE 1=1'; // Mulai dengan kondisi dasar
    const params = [];

    // Tambahkan kondisi filter jika parameter ada
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

    query += ' ORDER BY title ASC'; // Tambahkan order by

    const [modules] = await db.execute(query, params);
    res.status(200).json(modules);
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ message: 'Server error fetching modules.' });
  }
};

const getModuleById = async (req, res) => {
  try {
    const { id } = req.params;
    const [modules] = await db.execute('SELECT * FROM modules WHERE id = ?', [id]);
    const module = modules[0];

    if (!module) {
      return res.status(404).json({ message: 'Module not found.' });
    }
    res.status(200).json(module);
  } catch (error) {
    console.error('Error fetching module by ID:', error);
    res.status(500).json({ message: 'Server error fetching module.' });
  }
};

const createModule = async (req, res) => {
  const { title, description, video_url, difficulty, class_level, topic } = req.body;

  if (!title || !description || !video_url || !difficulty || !class_level || !topic) {
    return res.status(400).json({ message: 'All module fields (title, description, video_url, difficulty, class_level, topic) are required.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO modules (title, description, video_url, difficulty, class_level, topic) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, video_url, difficulty, class_level, topic]
    );
    res.status(201).json({ message: 'Module created successfully.', moduleId: result.insertId });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ message: 'Server error creating module.' });
  }
};

const updateModule = async (req, res) => {
  const { id } = req.params;
  const { title, description, video_url, difficulty, class_level, topic, ml_features } = req.body; // Tambahkan ml_features jika ingin diupdate

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
  if (ml_features !== undefined) { fieldsToUpdate.push('ml_features = ?'); params.push(JSON.stringify(ml_features)); } // Simpan sebagai JSON string

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update.' });
  }

  params.push(id); // Add module ID for WHERE clause

  try {
    const query = `UPDATE modules SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
    const [result] = await db.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Module not found or no changes made.' });
    }
    res.status(200).json({ message: 'Module updated successfully.' });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ message: 'Server error updating module.' });
  }
};

const deleteModule = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.execute('DELETE FROM modules WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Module not found.' });
    }
    res.status(200).json({ message: 'Module deleted successfully.' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ message: 'Server error deleting module.' });
  }
};

const getRecommendedModules = async (req, res) => {
  try {
    const userId = req.user.id;

    const [userCompletedModules] = await db.execute(`
      SELECT m.id, m.topic, m.difficulty, m.class_level
      FROM user_progress up
      JOIN modules m ON up.module_id = m.id
      WHERE up.user_id = ? AND up.is_completed = TRUE
      ORDER BY up.completed_at DESC
      LIMIT 5;
    `, [userId]);

    let recommendedModules = [];

    if (userCompletedModules.length > 0 && process.env.ML_MODEL_API_URL) {
      try {
        const mlResponse = await axios.post(process.env.ML_MODEL_API_URL, {
          user_id: userId,
          completed_modules: userCompletedModules
        });

        const recommendedModuleIds = mlResponse.data.recommendations;

        if (recommendedModuleIds && recommendedModuleIds.length > 0) {
          // Fetch details for recommended modules, excluding those already completed
          // MySQL does not support IN (?) for array of IDs directly, so map
          const placeHolders = recommendedModuleIds.map(() => '?').join(',');
          const [modulesFromMl] = await db.execute(`
            SELECT * FROM modules
            WHERE id IN (${placeHolders}) AND id NOT IN (SELECT module_id FROM user_progress WHERE user_id = ? AND is_completed = TRUE)
            LIMIT 5;
          `, [...recommendedModuleIds, userId]); // Spread recommendedModuleIds and add userId
          recommendedModules = modulesFromMl;
        }
      } catch (mlError) {
        console.error('Error calling ML model API:', mlError.message);
        console.log('Falling back to database-based recommendations.');
      }
    }

    if (recommendedModules.length === 0) {
      let query = `
        SELECT m.*
        FROM modules m
        LEFT JOIN user_progress up ON m.id = up.module_id AND up.user_id = ?
        WHERE up.module_id IS NULL `;
      const queryParams = [userId];

      if (userCompletedModules.length > 0) {
        const primaryTopic = userCompletedModules[0].topic;
        const primaryDifficulty = userCompletedModules[0].difficulty;
        query += `AND (m.topic = ? OR m.difficulty = ?) `;
        queryParams.push(primaryTopic, primaryDifficulty);
      }

      query += `ORDER BY RAND() LIMIT 5;`;

      const [fallbackModules] = await db.execute(query, queryParams);
      recommendedModules = fallbackModules;
    }

    res.status(200).json(recommendedModules);

  } catch (error) {
    console.error('Error getting recommended modules:', error);
    res.status(500).json({ message: 'Server error getting recommendations.' });
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