# QA Report – SmartBudget AI

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification)  
**Scope:** Lowest Price Finder feature verification; removal of Store Analytics; reset & regression checks

---

## 1. Build and run

| Check | Result (Pass / Fail) | Notes |
|-------|----------------------|--------|
| Backend builds (`cd backend && npm run build`) | Not run | Static code verification only |
| Frontend has no linter errors | Not run | — |
| Backend starts (e.g. `npm run dev` or `npm start`) | Not run | — |
| Frontend starts (e.g. `npx expo start`) | Not run | — |

---

## 2. Test cases

| # | Test case | Steps | Expected | Result (Pass / Fail) | Notes |
|---|-----------|--------|----------|----------------------|--------|
| 1 | **Removal: Stores Visited & Total Spend** | Search `insights.tsx` for Store Analytics UI and related API usage | No "Stores Visited", "Total Spend" cards or Total Spend per Store list; no getStores/getSummary | **Pass** | Grep found no matches. File has only: Ask SmartBudget, Lowest Price Finder (basket + Recommended Store card), Best price by store table. Refetch uses only getTransactions. |
| 2 | **Lowest Price – sum prices for basket** | Analyze how basket totals are computed per store | For each store, sum of item prices (from getBestStoreForItem) for all basket items | **Pass** | `basketBestStore` reduces over basket: for each item, getBestStoreForItem(item) → acc[store] += price. Correct aggregation. |
| 3 | **Lowest Price – item not in any store** | Check handling when item has no receipt data | Item does not add to any store total; no crash | **Pass** | getBestStoreForItem returns { store: "—", price: 0 } when no entries; condition `if (store === "—" \|\| price <= 0) return acc` skips that item. Correct. |
| 4 | **Lowest Price – recommended store selection** | Check which store is chosen as "Recommended Store" | For "Lowest Price Finder", the store with the **lowest** estimated total for the basket should be recommended | **Fail** | Code uses `Object.entries(basketBestStore).sort((a, b) => b[1] - a[1])[0]` (line 163). That sorts **descending** by total, so [0] is the store with the **highest** total. Recommended Store is therefore the most expensive option, not the lowest. **Fix:** use ascending sort and take first: `.sort((a, b) => a[1] - b[1])[0]`. |
| 5 | **Address – null/undefined safety** | Check how store address is displayed in Recommended Store card | Missing address shows "Address not available"; no crash on null/undefined | **Pass** | Display: `storeAddressMap.get(suggestedStore[0]) ?? "Address not available"`. storeAddressMap built only when `r.store?.address?.trim()` exists. Null/undefined safely handled. |
| 6 | **Reset – basket cleared on refreshKey** | Check if basket state resets when Global Reset runs | When refreshKey changes, basket is cleared | **Pass** | `useEffect(() => { setBasket([]); }, [refreshKey]);` (lines 109–111). Basket clears on reset. |
| 7 | **Reset – Recommended Store card on reset** | After reset, is Recommended Store card hidden? | When app is reset (no data), Recommended Store card should not show | **Pass** | suggestedStore is derived from basketBestStore, which is null when basket.length === 0. After reset, basket is cleared → suggestedStore is null → card not rendered. |
| 8 | **Regression – index.tsx overlay** | Confirm overlay style still defined and used | styles.overlay defined; Profile/Total Spent modals use overlay for dimming | **Pass** | styles.overlay at lines 468–473. getTheme provides overlay; ProfileModal and Total Spent modal use `style={[styles.modalOverlay, { backgroundColor: overlay }]}`. |
| 9 | **Regression – receipts.tsx theme** | Confirm receipts screen theme logic unchanged | Uses getTheme; no broken styles | **Pass** | getTheme(isDarkMode), { bg, glass, textPrimary, textSecondary }; container/scroll/cards use inline backgroundColor. refreshKey in useFocusEffect deps. |
| 10 | **No hardcoded addresses or prices** | Search new Lowest Price Finder UI for hardcoded data | No hardcoded addresses or prices in component | **Pass** | storeAddressMap from transactions (r.store?.address). estimatedTotal from suggestedStore[1]. All values from API/state. No literals for addresses or prices. |

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| **Recommended store is wrong store** | Add items to basket so multiple stores have different totals. View Recommended Store. | Expected: store with **lowest** estimated total. Actual: store with **highest** estimated total (sort order inverted in insights.tsx line 163). |

---

## 4. Summary

- **Overall:** **Fail** (one logic bug: recommended store selection inverted)
- **Ready for next task:** No — Builder should fix recommended-store sort order first.
- **Recommended next step:** In `frontend/app/(tabs)/insights.tsx` line 163, change  
  `Object.entries(basketBestStore).sort((a, b) => b[1] - a[1])[0]`  
  to  
  `Object.entries(basketBestStore).sort((a, b) => a[1] - b[1])[0]`  
  so the Recommended Store is the one with the **lowest** estimated total for the basket (true "Lowest Price Finder" behavior). Then re-run this tester to confirm.

---

## 5. Notes

- **Removal verified:** Store Analytics (Stores Visited, Total Spend, Total Spend per Store) is fully removed; refetch uses only getTransactions.
- **Address:** Type ReceiptWithStore includes `store?: { name?: string; address?: string | null }`; backend must return address on transaction/store for it to appear; otherwise "Address not available" is shown.
- **No hardcoded addresses or prices** in the new component; test criterion satisfied.
- Verification was static code review only; no live app run.
