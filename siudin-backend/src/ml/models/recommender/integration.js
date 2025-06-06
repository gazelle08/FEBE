const ModelLoader = require('./model_loader');
const Preprocessor = require('./preprocessor');

async function getRecommendations(userHistory) {
  if (!ModelLoader.model) {
    await ModelLoader.load();
  }

  const userProfileText = userHistory
    .map(item => `${item.topic} ${item.level} ${item.difficulty}`)
    .join(' ');
    
  const embedding = await ModelLoader.predict(userProfileText);
  
  return {
    embedding,
    recommendations: [] 
  };
}

module.exports = {
  getRecommendations
};