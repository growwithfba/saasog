// Single source of truth for resolving the user-facing name of a product.
//
// Read precedence: display_name (alias) → title (Amazon original) →
// productName (legacy submissions field) → 'Untitled Product'.
//
// Storage of the alias lives on research_products.display_name; see
// supabase/migrations/20260426000000_add_display_name_to_research_products.sql.
//
// On detail pages and dashboard rows, prefer the redux titleByAsin store
// over the row's display_name — the store carries optimistic updates after
// a rename. This helper is the fallback when the store has no entry.

export type ProductLike = {
  display_name?: string | null;
  title?: string | null;
  productName?: string | null;
};

export function getProductDisplayName(p: ProductLike | null | undefined): string {
  const fromAlias = (p?.display_name ?? '').trim();
  if (fromAlias) return fromAlias;
  const fromTitle = (p?.title ?? '').trim();
  if (fromTitle) return fromTitle;
  const fromLegacy = (p?.productName ?? '').trim();
  if (fromLegacy) return fromLegacy;
  return 'Untitled Product';
}
