'use client';

import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import dynamic from 'next/dynamic';
import { Login } from '@/components/auth/Login';
import { Dashboard } from '@/components/Dashboard/Dashboard';
import { useEffect, useState } from 'react';

// Import CsvUpload with no SSR
const CsvUpload = dynamic(() => import('@/components/Upload/CsvUpload').then(mod => mod.CsvUpload), {
  ssr: false,
  loading: () => <div className="animate-pulse">Loading...</div>
});

function Page() {
  const user = useSelector((state: RootState) => state.auth.user);
  const [localUser, setLocalUser] = useState<any>(null);
  
  // Check for user in localStorage as well (for beta functionality)
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setLocalUser(JSON.parse(storedUser));
    }
  }, []);

  // User is authenticated if either Redux state or localStorage shows they're logged in
  const isAuthenticated = user?.isAuthenticated || !!localUser;
  
  return (
    <main className="min-h-screen bg-slate-900">
      {isAuthenticated ? <Dashboard /> : <Login />}
    </main>
  );
}

export default Page;