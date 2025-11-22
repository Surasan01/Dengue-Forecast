import { useState } from 'react';

interface ApiConfigBarProps {
  apiBaseUrl: string;
  onSave: (url: string) => void;
}

export function ApiConfigBar({ apiBaseUrl, onSave }: ApiConfigBarProps) {
  const [inputValue, setInputValue] = useState(apiBaseUrl);
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    onSave(inputValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setInputValue(apiBaseUrl);
    setIsEditing(false);
  };

  if (!isEditing && apiBaseUrl) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium text-green-700 dark:text-green-300">API Connected</span>
        <button
          onClick={() => setIsEditing(true)}
          className="ml-2 text-xs text-green-600 dark:text-green-400 hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor="api-url" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
        🔗 API URL:
      </label>
      <input
        id="api-url"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="https://xxxx.ngrok-free.app"
        className="input-field text-sm min-w-[250px]"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
        >
          Save
        </button>
        {isEditing && (
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-all"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
