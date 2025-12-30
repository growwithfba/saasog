'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ResetPage() {
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const clearStorage = () => {
    try {
      // Clear all submissions related storage
      localStorage.removeItem('clientSubmissions');
      localStorage.removeItem('submissionIdMap');
      localStorage.removeItem('submissionBasics');
      
      // Clear any individual submission entries
      const allKeys = Object.keys(localStorage);
      const submissionKeys = allKeys.filter(key => key.startsWith('submission_'));
      
      submissionKeys.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Set success state
      setCleared(true);
      setError(null);
    } catch (error) {
      console.error('Error clearing storage:', error);
      setError('Failed to clear storage. Try again or check browser console for details.');
    }
  };
  
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-white mb-4">Reset Storage</h1>
        
        {!cleared ? (
          <>
            <p className="text-slate-300 mb-6">
              This will clear all saved product analyses from your browser storage.
              This action cannot be undone.
            </p>
            
            <div className="flex flex-col gap-4">
              <button
                onClick={clearStorage}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition"
              >
                Clear All Submissions
              </button>
              
              <Link href="/research" className="text-center text-blue-400 hover:text-blue-300">
                Cancel
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="bg-emerald-900/30 border border-emerald-700 text-emerald-400 p-4 rounded-lg mb-6">
              ✓ Storage has been successfully cleared
            </div>
            
            <Link 
              href="/research" 
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition"
            >
              Return to Research
            </Link>
          </>
        )}
        
        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-700 text-red-400 p-4 rounded-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
} 