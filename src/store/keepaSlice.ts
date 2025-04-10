// store/keepaSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './index';
import { KeepaAnalysisResult } from '../components/Keepa/KeepaTypes';

// Define interface for keepa state
interface KeepaState {
  results: KeepaAnalysisResult[];
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  selectedAsin: string | null;
  tokensLeft?: number;
}

// Define initial state
const initialState: KeepaState = {
  results: [],
  status: 'idle',
  error: null,
  selectedAsin: null,
  tokensLeft: undefined
};

// Create the slice
const keepaSlice = createSlice({
  name: 'keepa',
  initialState,
  reducers: {
    startAnalysis: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    setKeepaData: (state, action: PayloadAction<KeepaAnalysisResult[]>) => {
      state.results = action.payload;
      state.status = 'complete';
      state.error = null;
    },
    setTokenBalance: (state, action: PayloadAction<number>) => {
      state.tokensLeft = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    setSelectedAsin: (state, action: PayloadAction<string>) => {
      state.selectedAsin = action.payload;
    },
    clearAnalysis: (state) => {
      state.results = [];
      state.status = 'idle';
      state.error = null;
      state.selectedAsin = null;
    }
  }
});

// Export actions
export const {
  startAnalysis,
  setKeepaData,
  setTokenBalance,
  setError,
  setSelectedAsin,
  clearAnalysis
} = keepaSlice.actions;

// Export selectors
export const selectKeepaResults = (state: RootState) => state.keepa.results;
export const selectKeepaStatus = (state: RootState) => state.keepa.status;
export const selectKeepaError = (state: RootState) => state.keepa.error;
export const selectSelectedAsin = (state: RootState) => state.keepa.selectedAsin;
export const selectTokenBalance = (state: RootState) => state.keepa.tokensLeft;

// Export reducer
export default keepaSlice.reducer;