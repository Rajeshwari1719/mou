import { AlertCircle } from 'lucide-react';

export const Alert = ({ type = 'info', message, onClose, className = '' }) => {
  const typeStyles = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  };

  return (
    <div className={`border rounded-lg p-4 flex items-start gap-3 ${typeStyles[type]} ${className}`}>
      <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p>{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          ✕
        </button>
      )}
    </div>
  );
};

export default Alert;
