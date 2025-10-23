'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { analyzeText } from '@/utils/riskAnalysis';
import { Toaster, toast } from 'react-hot-toast';
import RewardedGate from '@/components/RewardedGate';

export default function Home() {
  const {
    originalText,
    rewrittenText,
    analysis,
    isAnalyzing,
    isRewriting,
    showAdGate,
    adCompleted,
    setOriginalText,
    setRewrittenText,
    setAnalysis,
    setAnalyzing,
    setRewriting,
    showAdGateModal,
    hideAdGateModal,
    markAdCompleted,
    useFreeRewrite
  } = useAppStore();

  const [honorPledge, setHonorPledge] = useState(false);

  // Analyze text when it changes
  useEffect(() => {
    if (originalText.trim()) {
      setAnalyzing(true);
      const timeoutId = setTimeout(() => {
        const result = analyzeText(originalText);
        setAnalysis(result);
        setAnalyzing(false);
      }, 150); // Debounce analysis
      
      return () => clearTimeout(timeoutId);
    } else {
      setAnalysis(null);
    }
  }, [originalText, setAnalysis, setAnalyzing]);

  const handleRewrite = async () => {
    if (!honorPledge) {
      toast.error('Please confirm the honor pledge');
      return;
    }

    if (!originalText.trim()) {
      toast.error('Please enter some text to rewrite');
      return;
    }

    if (originalText.split(/\s+/).length > 1200) {
      toast.error('Text is too long. Please limit to 1,200 words.');
      return;
    }

    // Check if we can use a free rewrite
    const canUseFree = useFreeRewrite();
    
    if (!canUseFree) {
      showAdGateModal();
      return;
    }

    await performRewrite();
  };

  const performRewrite = async () => {
    setRewriting(true);
    try {
      const response = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: originalText,
          targetBurstiness: 0.35 
        }),
      });

      if (!response.ok) {
        throw new Error('Rewrite failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let rewritten = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        rewritten += chunk;
        setRewrittenText(rewritten);
      }

      toast.success('Rewrite completed!');
    } catch (error) {
      toast.error('Rewrite failed. Please try again.');
      console.error('Rewrite error:', error);
    } finally {
      setRewriting(false);
    }
  };

  const handleAcceptRewrite = () => {
    setOriginalText(rewrittenText);
    setRewrittenText('');
    toast.success('Rewrite accepted!');
  };

  const handleKeepOriginal = () => {
    setRewrittenText('');
    toast('Keeping original text');
  };

  const handleAdReward = () => {
    markAdCompleted();
    performRewrite();
  };

  const handleExportPDF = async () => {
    if (!rewrittenText || !analysis) {
      toast.error('No rewrite available to export');
      return;
    }

    try {
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText,
          rewrittenText,
          originalScore: analysis.detectabilityScore,
          newScore: 85, // Mock improved score
          improvements: analysis.riskSignals.map(s => s.message)
        }),
      });

      if (!response.ok) {
        throw new Error('PDF export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rewrite-analysis.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('PDF exported successfully!');
    } catch (error) {
      toast.error('PDF export failed');
      console.error('Export error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Paper Rewriter</h1>
          <div className="flex items-center gap-6">
            <div className="text-sm text-gray-600">
              Words: {originalText.split(/\s+/).filter(w => w.length > 0).length}
            </div>
            {analysis && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Detectability:</span>
                <div className={`score-dial ${
                  analysis.detectabilityScore >= 80 ? 'border-green-500 text-green-600' :
                  analysis.detectabilityScore >= 60 ? 'border-yellow-500 text-yellow-600' :
                  'border-red-500 text-red-600'
                }`}>
                  {Math.round(analysis.detectabilityScore)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel - Editor */}
        <div className="flex-1 p-6">
          <div className="h-full flex flex-col">
            <div className="flex-1 mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Text
              </label>
              <textarea
                className="editor-textarea"
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="Paste your text here for analysis and rewriting..."
              />
            </div>
            
            {rewrittenText && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rewritten Text
                </label>
                <div className="bg-white border border-gray-300 rounded-lg p-4 h-48 overflow-y-auto">
                  <div className="whitespace-pre-wrap">{rewrittenText}</div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleAcceptRewrite}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
                  >
                    Accept Rewrite
                  </button>
                  <button
                    onClick={handleKeepOriginal}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700"
                  >
                    Keep Original
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
                  >
                    Export PDF
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={honorPledge}
                  onChange={(e) => setHonorPledge(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  I confirm this is my own writing
                </span>
              </label>
              <button
                onClick={handleRewrite}
                disabled={!honorPledge || isRewriting || !originalText.trim()}
                className="rewrite-button"
              >
                {isRewriting ? 'Rewriting...' : 'Rewrite'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Risk Analysis */}
        <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk Analysis</h2>
          
          {isAnalyzing ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Analyzing...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Overall Score */}
              <div className="risk-card">
                <h3 className="font-medium text-gray-900 mb-2">Overall Score</h3>
                <div className="flex items-center gap-3">
                  <div className={`score-dial ${
                    analysis.detectabilityScore >= 80 ? 'border-green-500 text-green-600' :
                    analysis.detectabilityScore >= 60 ? 'border-yellow-500 text-yellow-600' :
                    'border-red-500 text-red-600'
                  }`}>
                    {Math.round(analysis.detectabilityScore)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {analysis.detectabilityScore >= 80 ? 'Good' :
                     analysis.detectabilityScore >= 60 ? 'Fair' : 'Needs Improvement'}
                  </div>
                </div>
              </div>

              {/* Risk Signals */}
              {analysis.riskSignals.length > 0 && (
                <div className="risk-card">
                  <h3 className="font-medium text-gray-900 mb-2">Risk Signals</h3>
                  <div className="space-y-2">
                    {analysis.riskSignals.map((signal) => (
                      <div key={signal.id} className={`p-2 rounded text-sm ${
                        signal.severity === 'high' ? 'bg-red-50 border border-red-200' :
                        signal.severity === 'medium' ? 'bg-yellow-50 border border-yellow-200' :
                        'bg-blue-50 border border-blue-200'
                      }`}>
                        <div className="font-medium">{signal.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Statistics */}
              <div className="risk-card">
                <h3 className="font-medium text-gray-900 mb-2">Statistics</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <div>Words: {analysis.wordCount}</div>
                  <div>Sentences: {analysis.sentenceCount}</div>
                  <div>Avg sentence length: {analysis.avgSentenceLength.toFixed(1)}</div>
                  <div>Sentence variation: {(analysis.coefficientOfVariation * 100).toFixed(1)}%</div>
                  <div>Trigram repetition: {(analysis.trigramRepetition * 100).toFixed(1)}%</div>
                  <div>Function word entropy: {analysis.functionWordEntropy.toFixed(2)}</div>
                  <div>Punctuation per 100 words: {analysis.punctuationPer100Words.toFixed(1)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>Enter text to see risk analysis</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Ad Gate Modal */}
      <RewardedGate
        isOpen={showAdGate}
        onClose={hideAdGateModal}
        onReward={handleAdReward}
      />
    </div>
  );
}