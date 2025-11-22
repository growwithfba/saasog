'use client';

import { Provider } from 'react-redux';
import { store } from './index';
import { UserProvider } from '@/context/UserContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}><UserProvider>{children}</UserProvider></Provider>;
}