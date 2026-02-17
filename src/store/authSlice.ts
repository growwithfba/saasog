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
    updateSubscriptionStatus: (state, action: PayloadAction<{ subscription_status: User['subscription_status']; subscription_type: User['subscription_type'] }>) => {
      if (state.user) {
        state.user.subscription_status = action.payload.subscription_status;
        state.user.subscription_type = action.payload.subscription_type;
      }
    },
    logout: (state) => {
      state.user = null;
    }
  }
});

export const { setUser, setLoading, updateSubscriptionStatus, logout } = authSlice.actions;
export default authSlice.reducer;