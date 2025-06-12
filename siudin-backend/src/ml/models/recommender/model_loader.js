// src/ml/models/recommender/model_loader.js
const tf = require('@tensorflow/tfjs');
const path = require('path');
const preprocessor = require('./preprocessor');

class ModelLoader {
  constructor() {
    this.model = null;
    this.modelPath = path.resolve(__dirname, './model.json');
    this.isLoading = false;
    this.loadPromise = null;
  }

  async load() {
    if (this.model) {
      console.log('Model already loaded.');
      return true;
    }
    if (this.isLoading) {
      console.log('Model is already loading, awaiting existing promise.');
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        console.log('Loading model from:', this.modelPath);
        this.model = await tf.loadGraphModel(`file://${this.modelPath}`);

        const warmupInput = tf.tensor2d([Array(preprocessor.maxLength).fill(0)], [1, preprocessor.maxLength], 'float32');
        await this.model.predict(warmupInput).data();
        tf.dispose(warmupInput);

        console.log('Model loaded successfully');
        this.isLoading = false;
        this.loadPromise = null;
        return true;
      } catch (err) {
        console.error('Failed to load model:', err);
        this.model = null;
        this.isLoading = false;
        this.loadPromise = null;
        throw new Error('Failed to load ML model: ' + err.message);
      }
    })();
    return this.loadPromise;
  }

  async predict(text) {
    if (!this.model) {
      await this.load();
      if (!this.model) {
        throw new Error('ML model is not loaded and could not be loaded.');
      }
    }

    let inputTensor;
    let predictionTensor;
    try {
      inputTensor = preprocessor.preprocess(text);
      predictionTensor = this.model.predict(inputTensor);
      const result = await predictionTensor.data();
      return result;
    } finally {
      if (inputTensor) tf.dispose(inputTensor);
      if (predictionTensor) tf.dispose(predictionTensor);
    }
  }
}

module.exports = new ModelLoader();