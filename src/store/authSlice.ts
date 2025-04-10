import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface LoginCredentials {
  email: string;
  password: string;
}

interface User {
  email: string;
  id?: string;
}

interface AuthState {
  user: {
    email: string;
    isAuthenticated: boolean;
  } | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: false
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    logout: (state) => {
      state.user = null;
    }
  }
});

export const { setUser, setLoading, logout } = authSlice.actions;
export default authSlice.reducer;