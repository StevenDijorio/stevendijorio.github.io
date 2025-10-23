import nlp from 'compromise';
import { AnalysisResult, RiskSignal } from '@/store/useAppStore';

// Function words for entropy calculation
const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
]);

export function analyzeText(text: string): AnalysisResult {
  if (!text.trim()) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      coefficientOfVariation: 0,
      trigramRepetition: 0,
      functionWordEntropy: 0,
      punctuationPer100Words: 0,
      detectabilityScore: 100,
      riskSignals: []
    };
  }

  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  const words = doc.terms().out('array');
  const wordCount = words.length;
  const sentenceCount = sentences.length;
  
  // Calculate sentence lengths
  const sentenceLengths = sentences.map((s: string) => s.split(/\s+/).length);
  const avgSentenceLength = sentenceLengths.reduce((a: number, b: number) => a + b, 0) / sentenceLengths.length;
  
  // Coefficient of variation for sentence length
  const variance = sentenceLengths.reduce((acc: number, len: number) => acc + Math.pow(len - avgSentenceLength, 2), 0) / sentenceLengths.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = avgSentenceLength > 0 ? stdDev / avgSentenceLength : 0;
  
  // Trigram repetition
  const trigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = words.slice(i, i + 3).join(' ').toLowerCase();
    trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1);
  }
  const totalTrigrams = words.length - 2;
  const repeatedTrigrams = Array.from(trigrams.values()).filter(count => count > 1).length;
  const trigramRepetition = totalTrigrams > 0 ? repeatedTrigrams / totalTrigrams : 0;
  
  // Function word entropy
  const functionWordCounts = new Map<string, number>();
  let functionWordTotal = 0;
  
  words.forEach((word: string) => {
    const lowerWord = word.toLowerCase().replace(/[^\w]/g, '');
    if (FUNCTION_WORDS.has(lowerWord)) {
      functionWordCounts.set(lowerWord, (functionWordCounts.get(lowerWord) || 0) + 1);
      functionWordTotal++;
    }
  });
  
  let functionWordEntropy = 0;
  if (functionWordTotal > 0) {
    functionWordCounts.forEach((count: number) => {
      const probability = count / functionWordTotal;
      functionWordEntropy -= probability * Math.log2(probability);
    });
  }
  
  // Punctuation per 100 words
  const punctuationCount = (text.match(/[.,!?;:]/g) || []).length;
  const punctuationPer100Words = wordCount > 0 ? (punctuationCount / wordCount) * 100 : 0;
  
  // Generate risk signals
  const riskSignals: RiskSignal[] = [];
  
  // Sentence length variation
  if (coefficientOfVariation < 0.3) {
    riskSignals.push({
      id: 'sentence_variation',
      type: 'sentence_length',
      severity: coefficientOfVariation < 0.2 ? 'high' : 'medium',
      message: `Low sentence length variation (${coefficientOfVariation.toFixed(2)})`,
      value: coefficientOfVariation,
      threshold: 0.3
    });
  }
  
  // Trigram repetition
  if (trigramRepetition > 0.1) {
    riskSignals.push({
      id: 'trigram_repetition',
      type: 'repetition',
      severity: trigramRepetition > 0.2 ? 'high' : 'medium',
      message: `High trigram repetition (${(trigramRepetition * 100).toFixed(1)}%)`,
      value: trigramRepetition,
      threshold: 0.1
    });
  }
  
  // Function word entropy
  if (functionWordEntropy < 3.0) {
    riskSignals.push({
      id: 'function_word_entropy',
      type: 'entropy',
      severity: functionWordEntropy < 2.5 ? 'high' : 'medium',
      message: `Low function word diversity (${functionWordEntropy.toFixed(2)})`,
      value: functionWordEntropy,
      threshold: 3.0
    });
  }
  
  // Punctuation patterns
  if (punctuationPer100Words < 5 || punctuationPer100Words > 25) {
    riskSignals.push({
      id: 'punctuation_pattern',
      type: 'punctuation',
      severity: punctuationPer100Words < 3 || punctuationPer100Words > 30 ? 'high' : 'medium',
      message: `Unusual punctuation density (${punctuationPer100Words.toFixed(1)} per 100 words)`,
      value: punctuationPer100Words,
      threshold: 15
    });
  }
  
  // Calculate detectability score
  let detectabilityScore = 100;
  
  // Penalize low sentence variation
  if (coefficientOfVariation < 0.3) {
    detectabilityScore -= (0.3 - coefficientOfVariation) * 50;
  }
  
  // Penalize high repetition
  if (trigramRepetition > 0.1) {
    detectabilityScore -= (trigramRepetition - 0.1) * 200;
  }
  
  // Penalize low entropy
  if (functionWordEntropy < 3.0) {
    detectabilityScore -= (3.0 - functionWordEntropy) * 10;
  }
  
  // Penalize unusual punctuation
  if (punctuationPer100Words < 5 || punctuationPer100Words > 25) {
    const deviation = Math.min(Math.abs(punctuationPer100Words - 15), 10);
    detectabilityScore -= deviation * 2;
  }
  
  detectabilityScore = Math.max(0, Math.min(100, detectabilityScore));
  
  return {
    wordCount,
    sentenceCount,
    avgSentenceLength,
    coefficientOfVariation,
    trigramRepetition,
    functionWordEntropy,
    punctuationPer100Words,
    detectabilityScore,
    riskSignals
  };
}
