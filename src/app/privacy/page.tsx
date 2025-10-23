export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="prose max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Collection and Usage</h2>
            <p className="text-gray-700 mb-4">
              We are committed to protecting your privacy. This service is designed to help you improve your writing style while maintaining complete privacy of your content.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">What We Don't Store</h3>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Your essay or document content is never stored on our servers</li>
              <li>No personal information is collected beyond basic analytics</li>
              <li>Your text is processed in real-time and immediately discarded</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">What We Do Collect</h3>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Anonymous usage statistics (word count, processing time)</li>
              <li>Ad interaction data (impressions, completions)</li>
              <li>Basic browser information for service optimization</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Cookies and Tracking</h3>
            <p className="text-gray-700 mb-4">
              We use minimal cookies for:
            </p>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Remembering your free rewrite allowance</li>
              <li>Basic analytics to improve the service</li>
              <li>Ad network functionality</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Third-Party Services</h3>
            <p className="text-gray-700 mb-4">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Google AdSense for advertising</li>
              <li>AI model providers for text processing</li>
              <li>Analytics services for usage insights</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Age Restrictions</h3>
            <p className="text-gray-700 mb-4">
              This service is intended for users 18 years and older. Users under 18 should have parental consent before using this service.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Contact</h3>
            <p className="text-gray-700 mb-4">
              If you have any questions about this privacy policy, please contact us through our support channels.
            </p>
            
            <p className="text-sm text-gray-500 mt-8">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
        
        <div className="mt-8">
          <a 
            href="/" 
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ← Back to Editor
          </a>
        </div>
      </div>
    </div>
  );
}
