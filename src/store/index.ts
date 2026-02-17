import { configureStore } from '@reduxjs/toolkit';
import keepaReducer from './keepaSlice';
import authReducer from './authSlice';
import productTitlesReducer from './productTitlesSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    keepa: keepaReducer,
    productTitles: productTitlesReducer
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { store }; 