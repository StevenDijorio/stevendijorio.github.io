export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="prose max-w-none">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Service Description</h2>
            <p className="text-gray-700 mb-4">
              This service provides AI-powered writing style analysis and rewriting assistance. It is designed as a writing coach to help improve the naturalness and readability of your text.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Acceptable Use</h3>
            <p className="text-gray-700 mb-4">You agree to use this service only for:</p>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Improving your own original writing</li>
              <li>Learning about writing style and natural language patterns</li>
              <li>Academic and professional writing assistance</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Prohibited Uses</h3>
            <p className="text-gray-700 mb-4">You may not use this service to:</p>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Bypass plagiarism detection systems</li>
              <li>Generate content for academic dishonesty</li>
              <li>Process copyrighted material without permission</li>
              <li>Attempt to circumvent our rate limits or security measures</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Honor Pledge</h3>
            <p className="text-gray-700 mb-4">
              By using this service, you confirm that:
            </p>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>All text you submit is your own original work</li>
              <li>You will use the service ethically and responsibly</li>
              <li>You understand this is a writing style tool, not a plagiarism bypass</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Service Limitations</h3>
            <ul className="list-disc list-inside text-gray-700 mb-6 space-y-2">
              <li>Text processing is limited to 1,200 words per request</li>
              <li>Rate limits apply to prevent abuse</li>
              <li>Service availability is not guaranteed</li>
              <li>Results are suggestions and should be reviewed by the user</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Age Requirements</h3>
            <p className="text-gray-700 mb-4">
              This service is intended for users 18 years and older. Users under 18 must have parental consent to use this service.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Disclaimer</h3>
            <p className="text-gray-700 mb-4">
              This service is provided "as is" without warranties. We are not responsible for how you use the rewritten content or any consequences thereof. The service is designed to help with writing style, not to bypass academic integrity systems.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Modifications</h3>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of any changes.
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
