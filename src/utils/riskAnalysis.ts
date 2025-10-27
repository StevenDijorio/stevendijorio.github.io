/**
 * riskAnalysis.ts
 *
 * Fast, deterministic text analysis with bounded scoring.
 * Pure and web-worker safe. No async. No external calls. No PII.
 * compromise.js is optional and guarded.
 *
 * Output contract:
 *   analyze(text) => {
 *     overall_score: number;       // 0..100 risk score (higher = riskier)
 *     signals: Array<Signal>;      // individual metric contributions
 *     advice: string[];            // actionable guidance tied to the signals
 *   }
 *
 * Scoring weights (sum = 1.0). Tune here to calibrate relative influence:
 * - TYPE_TOKEN_RATIO_W         = 0.18  // Low lexical diversity is risky
 * - FUNCTION_WORD_ENTROPY_W    = 0.18  // Skewed function-word use can signal unnatural text
 * - SENTENCE_LENGTH_VARIANCE_W = 0.14  // Too uniform or too erratic sentence lengths
 * - REPEATED_NGRAMS_W          = 0.22  // Heavy repetition indicates templating or padding
 * - PUNCTUATION_SKEW_W         = 0.12  // Overuse of one punctuation mark
 * - PASSIVE_VOICE_PROXY_W      = 0.16  // Excess passive constructions reduce clarity
 */

export interface Signal {
  id: string;
  label: string;
  value: number;         // raw metric value, unit documented per signal
  norm: number;          // 0..1 normalized risk for this signal
  weight: number;        // contribution weight used in overall_score
  score: number;         // 0..100 contribution = norm * weight * 100
  evidence?: string[];   // brief evidence snippets if applicable
}

export interface AnalysisOutput {
  overall_score: number; // 0..100
  signals: Signal[];
  advice: string[];
}

// ---------- Optional compromise.js (guarded) ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: any | undefined;
/* eslint-enable @typescript-eslint/no-explicit-any */

let _cachedNlp: any | null | undefined = undefined;

function tryGetCompromise(): any | null {
  if (_cachedNlp !== undefined) return _cachedNlp;
  // Try CommonJS require
  try {
    if (typeof require === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const n = require('compromise');
      _cachedNlp = n || null;
      return _cachedNlp;
    }
  } catch {
    // ignore
  }
  // Try global (browser/worker) injection
  try {
    const g = (globalThis as any);
    if (g && g.nlp) {
      _cachedNlp = g.nlp;
      return _cachedNlp;
    }
  } catch {
    // ignore
  }
  _cachedNlp = null;
  return _cachedNlp;
}

// ---------- Core helpers (fast, deterministic) ----------

const FUNC_WORDS = new Set<string>([
  'the','a','an','and','or','but','if','than','that','which','who','whom','whose',
  'this','these','those','there','here','when','where','why','how',
  'is','am','are','was','were','be','been','being',
  'have','has','had','do','does','did','can','could','will','would','shall','should','may','might','must',
  'to','of','in','on','for','with','at','by','from','as','about','into','over','after','before','under','between','through','without','within','upon','against','during','across',
  'up','down','out','off','near','far',
  'all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','too','very','just','also','even','ever','never','once','again','further','then','than'
]);

const IRREG_PARTICIPLES = new Set<string>([
  'done','given','seen','known','made','built','sent','sold','told','taken','written','driven','caught',
  'kept','left','felt','heard','brought','bought','thought','found','held','read','set','put','cut','let',
  'paid','met','won','lost','begun','broken','chosen','come','become','grown','forgiven','shown','spoken'
]);

const BE_AUX = '(?:am|is|are|was|were|be|been|being)';
const ADV_OPT = '(?:\\s+\\w+ly)?'; // optional adverb like "quickly"
const BY_PHRASE_OPT = '(?:\\s+by\\b[^.?!]*)?';
const PASSIVE_REGEX = new RegExp(
  `\\b${BE_AUX}${ADV_OPT}\\s+\\b(?:\\w+ed|${Array.from(IRREG_PARTICIPLES).join('|')})\\b${BY_PHRASE_OPT}`,
  'i'
);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function toLowerAscii(s: string): string {
  return s.toLowerCase();
}

function splitSentences(text: string): string[] {
  // Prefer compromise sentence splitting if available
  const nlp = tryGetCompromise();
  if (nlp) {
    try {
      const arr: string[] = nlp(text).sentences().out('array') || [];
      if (arr.length) return arr.map((s) => s.trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }
  // Fast rule-based fallback
  const parts = text
    .replace(/([.?!])\s+(?=[A-Z])/g, '$1|') // likely sentence boundaries
    .replace(/([.?!])(\)|"])\s+/g, '$1$2|') // punctuation with closing tokens
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length) return parts;
  return [text.trim()].filter(Boolean);
}

function tokenizeWords(text: string): string[] {
  // Keep alphanumerics and apostrophes inside words
  const words = text
    .toLowerCase()
    .match(/[a-z0-9]+(?:'[a-z0-9]+)?/g);
  return words ? words : [];
}

function uniqCount(tokens: string[]): number {
  const set = new Set<string>();
  for (let i = 0; i < tokens.length; i++) set.add(tokens[i]);
  return set.size;
}

function typeTokenRatio(tokens: string[]): number {
  const n = tokens.length;
  if (n === 0) return 0;
  // Heaps-adjusted TTR to stabilize across lengths: TTR * sqrt(N / (N + k))
  const k = 50; // small regularizer
  const raw = uniqCount(tokens) / n;
  const adj = raw * Math.sqrt(n / (n + k));
  return clamp01(adj);
}

function functionWordDistribution(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (FUNC_WORDS.has(t)) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function shannonEntropy(counts: Map<string, number>): number {
  let total = 0;
  counts.forEach((c) => (total += c));
  if (total === 0) return 0;
  let H = 0;
  counts.forEach((c) => {
    const p = c / total;
    H += -p * Math.log2(p);
  });
  return H; // in bits
}

function normEntropy(entropyBits: number, categories: number): number {
  if (categories <= 1) return 0;
  const maxH = Math.log2(categories);
  return clamp01(entropyBits / maxH);
}

function sentenceLengths(sentences: string[]): number[] {
  const out: number[] = new Array(sentences.length);
  for (let i = 0; i < sentences.length; i++) {
    out[i] = tokenizeWords(sentences[i]).length;
  }
  return out;
}

function variance(nums: number[]): number {
  const n = nums.length;
  if (n <= 1) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += nums[i];
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = nums[i] - mean;
    ss += d * d;
  }
  return ss / n;
}

function coefficientOfVariation(nums: number[]): number {
  const n = nums.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += nums[i];
  const mean = sum / n;
  if (mean === 0) return 0;
  const v = variance(nums);
  return Math.sqrt(v) / mean;
}

function ngramCounts(tokens: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  if (tokens.length < n) return counts;
  let key = tokens.slice(0, n).join(' ');
  counts.set(key, 1);
  for (let i = n; i < tokens.length; i++) {
    // Rolling window: avoid join cost by rebuild; with small n join is fast
    key = tokens.slice(i - n + 1, i + 1).join(' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function repeatRatio(tokens: string[], nValues: number[] = [2, 3, 4]): {
  ratio: number;
  topRepeats: string[];
} {
  let tot = 0;
  let dup = 0;
  const top: { gram: string; count: number }[] = [];
  for (let idx = 0; idx < nValues.length; idx++) {
    const n = nValues[idx];
    const counts = ngramCounts(tokens, n);
    let localTot = 0;
    counts.forEach((c, g) => {
      localTot += c;
      if (c > 1) {
        dup += c - 1;
        if (top.length < 8) top.push({ gram: g, count: c });
      }
    });
    tot += localTot;
  }
  top.sort((a, b) => b.count - a.count);
  const topGrams = top.slice(0, 5).map((x) => `${x.gram}×${x.count}`);
  return { ratio: safeDiv(dup, tot), topRepeats: topGrams };
}

function punctuationStats(text: string): {
  density: number;   // punctuation chars / all chars
  maxShare: number;  // share of most frequent punctuation category
  leader: string;    // category name of leader
} {
  const cats: Record<string, number> = {
    period: 0,
    comma: 0,
    exclam: 0,
    question: 0,
    colon: 0,
    semicolon: 0,
    dash: 0,
    quotes: 0,
    paren: 0,
    ellipsis: 0,
    other: 0
  };
  const len = text.length;
  let punct = 0;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    switch (ch) {
      case '.':
        // detect ellipsis "..."
        if (i + 2 < len && text[i + 1] === '.' && text[i + 2] === '.') {
          cats.ellipsis++; punct += 3; i += 2;
        } else { cats.period++; punct++; }
        break;
      case ',':
        cats.comma++; punct++; break;
      case '!':
        cats.exclam++; punct++; break;
      case '?':
        cats.question++; punct++; break;
      case ':':
        cats.colon++; punct++; break;
      case ';':
        cats.semicolon++; punct++; break;
      case '-':
      case '–':
      case '—':
        cats.dash++; punct++; break;
      case '"':
      case '\'':
        cats.quotes++; punct++; break;
      case '(':
      case ')':
      case '[':
      case ']':
        cats.paren++; punct++; break;
      default:
        if (/[#\/\\@&*%~`^_|<>{}]/.test(ch)) { cats.other++; punct++; }
        break;
    }
  }
  let maxCount = 0;
  let leader = 'none';
  let sum = 0;
  for (const k in cats) {
    const v = cats[k];
    sum += v;
    if (v > maxCount) { maxCount = v; leader = k; }
  }
  const density = safeDiv(punct, len);
  const maxShare = safeDiv(maxCount, sum);
  return { density, maxShare, leader };
}

function passiveProxy(sentences: string[]): {
  ratioPassive: number;
  passiveExamples: string[];
} {
  if (sentences.length === 0) return { ratioPassive: 0, passiveExamples: [] };
  let count = 0;
  const examples: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (PASSIVE_REGEX.test(s)) {
      count++;
      if (examples.length < 3) {
        examples.push(normalizeWhitespace(s).slice(0, 160));
      }
    }
  }
  return { ratioPassive: count / sentences.length, passiveExamples: examples };
}

// ---------- Normalizers (0..1 risk) ----------

/**
 * TTR risk: low TTR => higher risk.
 *  - TTR <= 0.30 -> risk 1
 *  - TTR >= 0.70 -> risk 0
 */
function riskTTR(ttr: number): number {
  const hi = 0.70, lo = 0.30;
  if (ttr >= hi) return 0;
  if (ttr <= lo) return 1;
  return (hi - ttr) / (hi - lo);
}

/**
 * Function-word entropy risk: lower normalized entropy => higher risk.
 * Typical natural text ~0.6..0.9 of max. Penalize below 0.6 most.
 */
function riskFunctionEntropy(eNorm: number): number {
  const knee = 0.60;
  if (eNorm >= 0.90) return 0;
  if (eNorm >= knee) return clamp01((0.90 - eNorm) / (0.90 - knee) * 0.5);
  // Stronger penalty below knee
  return clamp01(0.5 + (knee - eNorm) / knee * 0.5);
}

/**
 * Sentence length variability risk: too uniform or too erratic is risky.
 * Use coefficient of variation (CV). Target band ~ [0.4, 1.0].
 */
function riskSentenceVar(cv: number): number {
  const lo = 0.40, hi = 1.00;
  if (cv >= lo && cv <= hi) return 0;
  if (cv < lo) return clamp01((lo - cv) / lo);
  // cv > hi
  return clamp01((cv - hi) / hi);
}

/**
 * Repeated n-grams risk: direct mapping with mild saturation.
 * ratio = duplicate n-grams / all n-grams across n=2..4.
 */
function riskRepeatedNgrams(ratio: number): number {
  // 0.00 => 0 risk, 0.10 => ~0.5 risk, 0.20+ => near 1
  if (ratio <= 0.02) return 0;
  if (ratio >= 0.20) return 1;
  return clamp01((ratio - 0.02) / (0.20 - 0.02));
}

/**
 * Punctuation skew risk: large maxShare with meaningful density.
 * Combine dominance and density so sparse punctuation doesn't over-penalize.
 */
function riskPunctSkew(maxShare: number, density: number): number {
  // Require some density; <2% punctuation => minimal signal
  const densFactor = clamp01(density / 0.05); // 5% density => full effect
  // If one mark is >50% of punctuation, start risk; >90% => max
  if (maxShare <= 0.50) return 0;
  const dom = clamp01((maxShare - 0.50) / 0.40);
  return clamp01(dom * densFactor);
}

/**
 * Passive proxy risk: high ratio of passive sentences is risky.
 * 20% is fine; 70% is max risk.
 */
function riskPassive(ratio: number): number {
  const ok = 0.20, max = 0.70;
  if (ratio <= ok) return 0;
  if (ratio >= max) return 1;
  return (ratio - ok) / (max - ok);
}

// ---------- Weights (documented above) ----------

const TYPE_TOKEN_RATIO_W = 0.18;
const FUNCTION_WORD_ENTROPY_W = 0.18;
const SENTENCE_LENGTH_VARIANCE_W = 0.14;
const REPEATED_NGRAMS_W = 0.22;
const PUNCTUATION_SKEW_W = 0.12;
const PASSIVE_VOICE_PROXY_W = 0.16;

// ---------- Advice generator ----------

function buildAdvice(signals: Signal[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    if (s.norm < 0.35) continue; // only actionable items
    switch (s.id) {
      case 'ttr':
        out.push('Vary your wording to raise lexical diversity. Replace frequently repeated words with synonyms and remove filler.');
        break;
      case 'func_entropy':
        out.push('Balance function words. Reduce overused linkers (e.g., "and", "that"). Use precise nouns and verbs.');
        break;
      case 'sent_var':
        out.push('Adjust sentence rhythm. Mix short and medium sentences or split very long ones to stabilize variability.');
        break;
      case 'repeats':
        out.push('Delete repeated phrases and templates. Merge duplicate ideas and rewrite recurring bigrams and trigrams.');
        break;
      case 'punct_skew':
        out.push('Normalize punctuation. Replace clusters of the dominant mark with appropriate alternatives.');
        break;
      case 'passive':
        out.push('Prefer active voice. Identify passive constructions and rewrite with explicit subjects performing actions.');
        break;
      default:
        break;
    }
  }
  // De-duplicate while keeping order
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (!seen.has(a)) { seen.add(a); dedup.push(a); }
  }
  return dedup;
}

// ---------- Main API ----------

export function analyze(input: string): AnalysisOutput {
  const text = normalizeWhitespace(toLowerAscii(input || ''));
  const sentences = splitSentences(text);
  const tokens = tokenizeWords(text);

  // Metrics
  const ttr = typeTokenRatio(tokens);

  const fwCounts = functionWordDistribution(tokens);
  const entBits = shannonEntropy(fwCounts);
  const entNorm = normEntropy(entBits, Math.max(2, FUNC_WORDS.size));

  const sentLens = sentenceLengths(sentences);
  const cv = coefficientOfVariation(sentLens);

  const { ratio: repRatio, topRepeats } = repeatRatio(tokens);

  const { density: punctDensity, maxShare: punctMaxShare, leader: punctLeader } = punctuationStats(input);

  const { ratioPassive, passiveExamples } = passiveProxy(sentences);

  // Risks (0..1)
  const rTTR = riskTTR(ttr);
  const rEnt = riskFunctionEntropy(entNorm);
  const rSent = riskSentenceVar(cv);
  const rRep = riskRepeatedNgrams(repRatio);
  const rPunc = riskPunctSkew(punctMaxShare, punctDensity);
  const rPass = riskPassive(ratioPassive);

  // Signals
  const signals: Signal[] = [
    {
      id: 'ttr',
      label: 'Type–Token Ratio',
      value: ttr,
      norm: rTTR,
      weight: TYPE_TOKEN_RATIO_W,
      score: Math.round(rTTR * TYPE_TOKEN_RATIO_W * 100),
    },
    {
      id: 'func_entropy',
      label: 'Function-word Entropy (normalized)',
      value: entNorm,
      norm: rEnt,
      weight: FUNCTION_WORD_ENTROPY_W,
      score: Math.round(rEnt * FUNCTION_WORD_ENTROPY_W * 100),
    },
    {
      id: 'sent_var',
      label: 'Sentence Length CV',
      value: cv,
      norm: rSent,
      weight: SENTENCE_LENGTH_VARIANCE_W,
      score: Math.round(rSent * SENTENCE_LENGTH_VARIANCE_W * 100),
    },
    {
      id: 'repeats',
      label: 'Repeated n-grams ratio',
      value: repRatio,
      norm: rRep,
      weight: REPEATED_NGRAMS_W,
      score: Math.round(rRep * REPEATED_NGRAMS_W * 100),
      evidence: topRepeats
    },
    {
      id: 'punct_skew',
      label: `Punctuation skew (leader=${punctLeader})`,
      value: punctMaxShare,
      norm: rPunc,
      weight: PUNCTUATION_SKEW_W,
      score: Math.round(rPunc * PUNCTUATION_SKEW_W * 100),
    },
    {
      id: 'passive',
      label: 'Passive voice proxy ratio',
      value: ratioPassive,
      norm: rPass,
      weight: PASSIVE_VOICE_PROXY_W,
      score: Math.round(rPass * PASSIVE_VOICE_PROXY_W * 100),
      evidence: passiveExamples
    }
  ];

  // Overall score
  let overall = 0;
  for (let i = 0; i < signals.length; i++) {
    overall += signals[i].norm * signals[i].weight;
  }
  const overall_score = Math.round(clamp01(overall) * 100);

  const advice = buildAdvice(signals);

  return { overall_score, signals, advice };
}

export default analyze;