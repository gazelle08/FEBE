const tf = require('@tensorflow/tfjs');
const natural = require('natural');
const path = require('path');
const vocab = require('./vocab.json');

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

class TextPreprocessor {
  constructor() {
    this.wordIndex = vocab.word_index;
    this.numWords = vocab.config.num_words;
    this.oovToken = vocab.config.oov_token;
    this.oovIndex = this.wordIndex[this.oovToken];
  }

  textToSequence(text) {
    const tokens = tokenizer.tokenize(text.toLowerCase());
    const stemmed = tokens.map(t => stemmer.stem(t));
    
    return stemmed.map(word => {
      return this.wordIndex[word] || this.oovIndex;
    });
  }

  padSequence(sequence, maxLength = 2179) {
    if (sequence.length > maxLength) {
      return sequence.slice(0, maxLength);
    }
    return sequence.concat(Array(maxLength - sequence.length).fill(0));
  }

  preprocess(text) {
    const sequence = this.textToSequence(text);
    const padded = this.padSequence(sequence);
    return tf.tensor2d([padded], [1, 2179]);
  }
}

module.exports = new TextPreprocessor();