'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

// Rename and export this so createContext can use it
interface UserContextType {
  user: {
    email: string;
    isAuthenticated: boolean;
  } | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: false
});

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useSelector((state: RootState) => state.auth);

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
