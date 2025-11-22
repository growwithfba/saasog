import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from "@/models/user";
interface AuthState {
  user: User | null;
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
    setUser: (state, action: PayloadAction<User>) => {
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