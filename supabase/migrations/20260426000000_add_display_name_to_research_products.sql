-- Phase 3.1: user-facing alias for Amazon products.
--
-- display_name is an alias layered on top of the immutable Amazon title;
-- it never replaces title. Read precedence in code:
--   getProductDisplayName(p) := p.display_name ?? p.title.
--
-- Surfaced in dashboards / list rows / ProductHeader. The original
-- Amazon title still renders in places that show the actual listing
-- (research-detail listing card, vetting matrix cells, etc.).
--
-- Scope: keyed by research_products.id (one alias per ASIN, follows
-- the product through Research → Vetting → Offering → Sourcing,
-- including single-ASIN uploads).
--
-- See docs/phase-3-funnel-ux.md §3.1.

alter table public.research_products
  add column if not exists display_name text;
