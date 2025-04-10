import { configureStore } from '@reduxjs/toolkit';
import keepaReducer from './keepaSlice';
import authReducer from './authSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    keepa: keepaReducer
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { store }; 