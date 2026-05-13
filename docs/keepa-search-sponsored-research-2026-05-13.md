# Keepa API: search endpoint + sponsored detection — research note

**Date:** 2026-05-13
**Question driving this:** Can Keepa replace SERP DOM entirely for the research + vetting flow? Specifically: (a) does Keepa expose an endpoint that returns ASINs for a free-text keyword query, and (b) does Keepa expose a sponsored / advertising flag for any ASIN.

**Bottom line:** Dave was right that I was wrong on (a). I was right on (b). Order-of-results on (a) is still an empirical question and needs a probe before we commit.

---

## 1. Keyword → ASIN search via Keepa: CONFIRMED EXISTS

### The `/search` REST endpoint

Source: [keepacom/api_backend Request.java](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Request.java) (Keepa's own official Java SDK).

**Endpoint:** `/search`

**Parameters:**
- `domain` — Amazon locale
- `type` — `"product"` or `"category"`
- `term` — search keywords (min 3 chars, multiple space-separated keywords supported, all must match)
- `page` — 0–9 pagination, 10 results per page (or 40 by default without paging)
- `asins-only` — return only ASINs list
- `stats`, `update`, `history` — same modifiers as the `/product` endpoint, applied to each result

**Returns:** Up to 50 product results (or ASIN-only list). Response field is `asinList` (per [Response.java](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Response.java)) or the full `products` array with hydrated data.

### Why I was wrong yesterday

I checked the Python wrapper docs ([keepaapi.readthedocs.io](https://keepaapi.readthedocs.io/en/latest/api_methods.html)) and saw only `product_finder()`, which hits `/query` and filters Keepa's database (great for "find all products with BSR < X and reviews > Y", not great for "find what Amazon shows for 'deviled egg holder'"). I generalized from the wrapper's limitations to the underlying REST API. The Python wrapper does **not** expose `/search`. The REST API does.

### Open question: result ordering

The docs do NOT state whether `/search` returns ASINs in:
- (A) Amazon SERP relevance order (what BloomLens currently captures from the DOM), OR
- (B) Keepa-internal order (likely sales rank, since that's how Keepa's other lists work — e.g. [their note](https://keepa.com/) says "the sub-category lists are created by us based on the product's primary sales rank and do not reflect the actual ordering on Amazon")

The order matters for our use case. Two scenarios:

- **If Keepa-ordered (sales rank):** The competitor list for "deviled egg holder" via Keepa might surface different ASINs than what the user sees on Amazon right now. Good: more stable, no SERP DOM scraping fragility. Bad: user could click "Analyze Market" while looking at SERP X and get an analysis based on different competitors.
- **If Amazon-SERP-ordered:** Drop-in replacement for SERP DOM scraping. Cleanest outcome.

**This needs a probe.** Cannot resolve from docs alone.

### Other knowable risks

- Keepa Best Sellers docs say: "If a product does not have an accessible sales rank it will not be included in the lists." If `/search` shares that filter, brand-new listings with no rank yet would be invisible to us. SERP DOM doesn't have that filter.
- Keepa default: "we return one variation per parent." Amazon SERP returns child ASINs. If `/search` follows the same parent-dedup rule, our variation-count behavior changes.

Both of these are empirical and the probe will reveal them.

---

## 2. Sponsored / ad placement: CONFIRMED NOT IN KEEPA

I checked four sources and they all agree: Keepa does not track sponsored placement.

### Sources checked

- [Product.java struct](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Product.java) — 100+ fields, none related to sponsored/ad/promoted status
- [Response.java struct](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Response.java) — no advertising fields
- [Python wrapper docs](https://keepaapi.readthedocs.io/en/latest/api_methods.html) — no advertising methods
- [FBA Mogul Product Finder guide](https://fbamogul.com/keepa-product-finder-getting-started-guide/) — comprehensive filter list, no advertising filter

### Why this is structurally true (not just a doc gap)

Amazon Sponsored Product placements are:
- **Personalized** — different users see different sponsored ASINs for the same query (based on bid + relevance + user signals)
- **Dynamic** — re-randomized per page load
- **Auction-driven** — change minute-to-minute as sellers adjust bids

No third-party data provider can give us "is this ASIN sponsored?" as a stable attribute, because the answer depends on WHO is looking and WHEN. SERP DOM scraping captures one snapshot at the moment the user loaded their search page. That's the only way to know.

### Implication for the sweep

If we want to preserve sponsored-flagging in vetting analyses, SERP DOM remains the sole source. Two paths:

- **Keep SERP DOM solely for `sponsored` boolean per ASIN.** Everything else (title, brand, image, price, reviews, BSR, FBA fee, weight, dims, listing age, variations, fulfillment) → Keepa.
- **Drop sponsored entirely** from the vetting data model. Argument: a transient snapshot of one user's SERP at one moment isn't a durable market attribute. The vetting score doesn't currently weight `sponsored` heavily; we could remove it and the analysis still works.

Dave's call.

---

## 3. Updated mental model for the sweep

### What I claimed yesterday (wrong)

> SERP DOM's only legitimate role: telling us which ASINs are visible on a SERP, plus the `sponsored` flag.

### What's actually true

| Capability | SERP DOM | Keepa /search | Keepa /product | Keepa /query |
|---|---|---|---|---|
| Keyword → ASIN list | ✅ | ✅ (order TBD via probe) | ❌ | ❌ (filter-based) |
| Sponsored flag | ✅ | ❌ | ❌ | ❌ |
| SERP-rank position | ✅ | ❓ (probe required) | ❌ | ❌ |
| Hydrated product data | ⚠️ (unreliable) | ✅ | ✅ | ✅ |
| Brand-new untracked listings | ✅ | ❓ (probe required) | depends on tracking | depends on tracking |

### What this means for the four entry points

1. **`/api/extension/save-funnel`** — user clicked Save on a specific ASIN. We already have the ASIN. Use Keepa `/product` for hydration. SERP DOM only needed if we want to preserve the sponsored flag at moment-of-save.
2. **`/api/extension/analyze-market`** — user clicked Analyze on a SERP. Currently uses SERP-captured ASIN list. Could swap to Keepa `/search` IF the probe shows order is good enough. Sponsored flag question still open.
3. **"Add single ASIN" on Fill My Funnel** — user typed an ASIN. Just hydrate via Keepa `/product`. SERP not involved.
4. **BloomLens CSV upload** — user uploaded a CSV with ASINs. Just hydrate via Keepa `/product`. SERP not involved.

So three of the four entry points don't need SERP at all — already aligned with the sweep plan. The contested one is `analyze-market`, where the SERP-DOM-captured ASIN list is currently the input.

---

## 4. Recommended next step: empirical probe

Before committing the architecture, run a probe:

**File:** `scripts/probes/keepa-search-vs-serp.ts`

**Test:** For 5–10 representative search queries (deviled egg holder, dart board, suction cup glass lifter, etc. — match what BloomLens users are searching):
1. Call Keepa `/search?term=<query>&domain=1&type=product&page=0` and get the first 40 ASINs
2. Compare against the ASIN list BloomLens captured from the actual Amazon SERP for the same query (if we have one in our DB) — OR ask Dave to run BloomLens on each query and export the CSV
3. Compute:
   - Overlap rate (how many of Keepa's ASINs appear in Amazon's SERP first 40)
   - Order correlation (Spearman rank, roughly — are #1 in Keepa near #1 in Amazon?)
   - Coverage gaps (ASINs Amazon shows that Keepa doesn't return — likely brand-new listings)
4. Also test pagination: do pages 0–9 cover enough breadth for our use case (we typically need ~10–20 competitors per analysis)?

**Decision criteria:**
- If overlap is high (>70%) AND order correlation is decent → swap `analyze-market` to Keepa `/search`, drop SERP-DOM as ASIN source
- If overlap is low OR order is wildly different → keep SERP-DOM as the ASIN-discovery mechanism for `analyze-market`, but ALL field hydration still goes through Keepa (which is the actual sweep)

Either way, the sweep's core thesis — "field data comes from Keepa, never SERP DOM" — still holds. The probe just determines whether we also displace SERP DOM as the ASIN-list source.

---

## Sources

- [Keepa Java SDK Request.java](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Request.java)
- [Keepa Java SDK Response.java](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Response.java)
- [Keepa Java SDK Product.java](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Product.java)
- [Keepa Python wrapper API methods](https://keepaapi.readthedocs.io/en/latest/api_methods.html)
- [Keepa Python wrapper queries doc](https://keepaapi.readthedocs.io/en/latest/product_query.html)
- [FBA Mogul: Keepa Product Finder filter guide](https://fbamogul.com/keepa-product-finder-getting-started-guide/)
- [Just One Dime: How to use Keepa](https://justonedime.com/blog/how-to-use-keepa-for-amazon-fba)
- [Keepa API homepage](https://keepa.com/#!api)
