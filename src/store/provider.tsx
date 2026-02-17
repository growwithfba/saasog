'use client';

import { Provider } from 'react-redux';
import { store } from './index';
import { UserProvider } from '@/context/UserContext';
import SubscriptionCheck from '@/components/SubscriptionCheck';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <UserProvider>
        <SubscriptionCheck>
          {children}
        </SubscriptionCheck>
      </UserProvider>
    </Provider>
  );
}