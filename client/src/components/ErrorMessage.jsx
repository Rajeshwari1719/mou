import { AlertCircle } from 'lucide-react';

export const ErrorMessage = ({ message, onRetry }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
      <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
      <p className="text-gray-600 mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Retry
        </button>
      )}
    </div>
  </div>
);

export default ErrorMessage;
