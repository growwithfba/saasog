"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { ImprovedCsvUpload } from '../../components/upload/ImprovedCsvUpload';

const AnalyzePage: React.FC = () => {
  const router = useRouter();
  const { user } = useUser();
  
  const handleSubmit = () => {
    router.push('/dashboard');
  };
  
  return (
    <div>
      <ImprovedCsvUpload onSubmit={handleSubmit} userId={user?.email || ''} />
    </div>
  );
};

export default AnalyzePage; 