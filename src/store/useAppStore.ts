import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface RiskSignal {
  id: string;
  type: 'sentence_length' | 'repetition' | 'entropy' | 'punctuation' | 'burstiness';
  severity: 'low' | 'medium' | 'high';
  message: string;
  value: number;
  threshold: number;
}

export interface AnalysisResult {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  coefficientOfVariation: number;
  trigramRepetition: number;
  functionWordEntropy: number;
  punctuationPer100Words: number;
  detectabilityScore: number;
  riskSignals: RiskSignal[];
}

interface AppState {
  // Text content
  originalText: string;
  rewrittenText: string;
  isRewriting: boolean;
  
  // Analysis
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
  
  // UI state
  showAdGate: boolean;
  adCompleted: boolean;
  freeRewritesUsed: number;
  lastFreeRewriteDate: string | null;
  
  // Actions
  setOriginalText: (text: string) => void;
  setRewrittenText: (text: string) => void;
  setAnalysis: (analysis: AnalysisResult | null) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setRewriting: (rewriting: boolean) => void;
  showAdGateModal: () => void;
  hideAdGateModal: () => void;
  markAdCompleted: () => void;
  useFreeRewrite: () => boolean;
  reset: () => void;
}

const initialState = {
  originalText: '',
  rewrittenText: '',
  isRewriting: false,
  analysis: null,
  isAnalyzing: false,
  showAdGate: false,
  adCompleted: false,
  freeRewritesUsed: 0,
  lastFreeRewriteDate: null,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,
  
  setOriginalText: (text: string) => set({ originalText: text }),
  setRewrittenText: (text: string) => set({ rewrittenText: text }),
  setAnalysis: (analysis: AnalysisResult | null) => set({ analysis }),
  setAnalyzing: (analyzing: boolean) => set({ isAnalyzing: analyzing }),
  setRewriting: (rewriting: boolean) => set({ isRewriting: rewriting }),
  
  showAdGateModal: () => set({ showAdGate: true }),
  hideAdGateModal: () => set({ showAdGate: false }),
  markAdCompleted: () => set({ adCompleted: true, showAdGate: false }),
  
  useFreeRewrite: () => {
    const state = get();
    const today = new Date().toDateString();
    
    // Check if we can use a free rewrite
    if (state.freeRewritesUsed < 1 || state.lastFreeRewriteDate !== today) {
      const newUsed = state.lastFreeRewriteDate === today ? state.freeRewritesUsed : 0;
      set({ 
        freeRewritesUsed: newUsed + 1, 
        lastFreeRewriteDate: today,
        adCompleted: true 
      });
      return true;
    }
    return false;
  },
  
  reset: () => set(initialState),
}));
