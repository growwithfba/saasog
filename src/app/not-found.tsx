import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 text-center">
        <h1 className="text-white text-4xl font-bold mb-4">404</h1>
        <h2 className="text-slate-300 text-xl mb-6">Page Not Found</h2>
        <p className="text-slate-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link 
          href="/research" 
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors inline-block"
        >
          Return to Research
        </Link>
      </div>
    </div>
  );
} 