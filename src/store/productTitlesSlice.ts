import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ProductTitlesState = {
  byAsin: Record<string, string>;
};

const initialState: ProductTitlesState = {
  byAsin: {},
};

function normalizeAsin(asin: string) {
  return (asin || '').trim();
}

export const productTitlesSlice = createSlice({
  name: 'productTitles',
  initialState,
  reducers: {
    setDisplayTitle(state, action: PayloadAction<{ asin: string; title: string }>) {
      const asin = normalizeAsin(action.payload.asin);
      const title = (action.payload.title || '').trim();
      if (!asin || !title) return;
      state.byAsin[asin] = title;
    },
    hydrateDisplayTitles(
      state,
      action: PayloadAction<Array<{ asin: string; title: string | null | undefined }>>
    ) {
      for (const item of action.payload) {
        const asin = normalizeAsin(item.asin);
        const title = (item.title || '').trim();
        if (!asin || !title) continue;
        state.byAsin[asin] = title;
      }
    },
    clearDisplayTitle(state, action: PayloadAction<{ asin: string }>) {
      const asin = normalizeAsin(action.payload.asin);
      if (!asin) return;
      delete state.byAsin[asin];
    },
  },
});

export const { setDisplayTitle, hydrateDisplayTitles, clearDisplayTitle } = productTitlesSlice.actions;
export default productTitlesSlice.reducer;


