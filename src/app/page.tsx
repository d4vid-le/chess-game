"use client";

import { useState, useEffect } from 'react';
import ChessGame from './components/ChessGame';

export default function Home() {
  // LM Studio URL provided by the user
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:11434/v1');
  const [showSettings, setShowSettings] = useState(false);

  // Listen for toggle settings event from the ChessGame component
  useEffect(() => {
    const handleToggleSettings = () => {
      setShowSettings(!showSettings);
    };

    window.addEventListener('toggleSettings', handleToggleSettings);

    return () => {
      window.removeEventListener('toggleSettings', handleToggleSettings);
    };
  }, [showSettings]);

  return (
    <div className="min-h-screen overflow-hidden font-[family-name:var(--font-geist-sans)] bg-gray-900 flex items-center justify-center py-2 px-1 xs:px-2 sm:px-4 sm:py-4">
      <main className="w-full max-w-6xl px-2 xs:px-3 sm:px-4 py-3 sm:py-6 flex flex-col items-center">
        {/* Title removed */}

        {/* Buttons moved to ChessGame component */}

        {showSettings && (
          <div className="mb-8 p-5 bg-gray-800 rounded-lg border border-gray-700 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">LM Studio Connection</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-grow">
                <label htmlFor="lmStudioUrl" className="block mb-2 text-sm font-medium text-gray-300">
                  API URL
                </label>
                <input
                  type="text"
                  id="lmStudioUrl"
                  value={lmStudioUrl}
                  onChange={(e) => setLmStudioUrl(e.target.value)}
                  className="w-full p-3 border border-gray-600 rounded-md bg-gray-900 text-gray-200 font-mono text-sm shadow-inner focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setLmStudioUrl('http://localhost:11434/v1')}
                  className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-500 border border-blue-700 shadow-md transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </div>
            <div className="mt-4 p-3 bg-gray-900 rounded-md border border-gray-700">
              <p className="text-sm text-gray-300 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Make sure LM Studio is running locally with the server enabled.
              </p>
            </div>
          </div>
        )}

        <div className="w-full">
          <ChessGame lmStudioUrl={lmStudioUrl} />
        </div>
      </main>

      {/* Footer removed */}
    </div>
  );
}
