'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

interface RewardedGateProps {
  isOpen: boolean;
  onClose: () => void;
  onReward: () => void;
}

export default function RewardedGate({ isOpen, onClose, onReward }: RewardedGateProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Initialize ad SDK here
      // This is a placeholder - replace with actual ad SDK integration
      initializeAdSDK();
    }
  }, [isOpen]);

  const initializeAdSDK = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Mock ad SDK initialization
      // Replace with actual Google Ad Manager or AdSense integration
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAdLoaded(true);
      setIsLoading(false);
    } catch (err) {
      setError('Failed to load ad. Please try again.');
      setIsLoading(false);
    }
  };

  const showRewardedAd = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Mock ad display
      // Replace with actual rewarded ad implementation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate successful ad completion
      onReward();
      onClose();
      
    } catch (err) {
      setError('Ad failed to complete. Please try again.');
      setIsLoading(false);
    }
  };

  const handleFreeRewrite = () => {
    onReward();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Watch an Ad to Continue
          </h2>
          
          <p className="text-gray-600 mb-6">
            You've used your free rewrite for today. Watch a short ad to continue rewriting your text.
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <button
              onClick={showRewardedAd}
              disabled={!adLoaded || isLoading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Loading Ad...' : 'Watch Ad to Continue'}
            </button>
            
            <button
              onClick={handleFreeRewrite}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Use Free Rewrite (1 remaining today)
            </button>
            
            <button
              onClick={onClose}
              className="w-full text-gray-500 py-2 px-4 rounded-lg hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
          
          <div className="mt-4 text-xs text-gray-500 text-center">
            <p>By watching an ad, you help support this free service.</p>
            <p>Your text is never stored or shared.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
