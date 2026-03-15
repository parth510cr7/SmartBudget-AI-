# QA Report – SmartBudget AI

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification)  
**Scope:** Search/Insights tab + Global Reset verification; hardcoded data check; overlay + IOS_BG regression

---

## 1. Build and run

| Check | Result (Pass / Fail) | Notes |
|-------|----------------------|--------|
| Backend builds (`cd backend && npm run build`) | Not run | Scope was static code verification per instructions |
| Frontend has no linter errors | Not run | — |
| Backend starts (e.g. `npm run dev` or `npm start`) | Not run | — |
| Frontend starts (e.g. `npx expo start`) | Not run | — |

---

## 2. Test cases (code verification)

| # | Test case | Steps | Expected | Result (Pass / Fail) | Notes |
|---|-----------|--------|----------|----------------------|--------|
| 1 | **No hardcoded/mock data in Insights** | Inspect `frontend/app/(tabs)/insights.tsx` for mock/dummy/fake or hardcoded store names/prices used in UI | No such data used in UI; all displayed data from API or derived from API | **Pass** | No variables named mock/dummy/fake. Only occurrence of "mock" is in a comment (line 260). Stores, totalSpent, transactions from getStores/getSummary/getTransactions. bestPriceByItem from buildBestPriceByItem(transactions). No hardcoded arrays/objects mapped in JSX. |
| 2 | **Reset trigger (Profile Modal)** | Check `index.tsx` Profile Modal reset flow | Reset calls purgeAllData then triggerDashboardRefresh(); modal closes | **Pass** | handleReset (lines 135–156): Alert → "Reset" → purgeAllData(authToken) → useStore.getState().triggerDashboardRefresh() → onClose(). |
| 3 | **Insights listens to reset** | Check `insights.tsx` reacts to refreshKey | insights refetches when refreshKey changes; state clears when API returns empty | **Pass** | refreshKey from store (line 84). useEffect(() => { refetch(); }, [refetch, refreshKey]) (121–123). refetch without auth clears stores/totalSpent/transactions; with auth calls API and sets state. bestPriceByItem = useMemo(..., [transactions]) so empty transactions → empty table. |
| 4 | **Overlay style (index.tsx)** | Confirm overlay fix intact in Profile/Total Spent modals | styles.overlay defined; modal uses overlay prop for backgroundColor | **Pass** | styles.overlay defined in StyleSheet (lines 468–473). getTheme provides overlay (theme). ProfileModal receives overlay prop; View uses style={[styles.modalOverlay, { backgroundColor: overlay }]} (line 165). Total Spent modal same pattern (line 444). |
| 5 | **IOS_BG / glass in receipts.tsx** | Confirm no IOS_BG/GLASS_WHITE in StyleSheet; theme used inline | Receipts use getTheme; bg/glass applied inline only | **Pass** | receipts.tsx uses getTheme(isDarkMode), { bg, glass, textPrimary, textSecondary }. No IOS_BG or GLASS_WHITE in StyleSheet. All card/background styling uses backgroundColor: glass or bg inline. |

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| None | — | Overlay and IOS_BG/theme fixes are intact. |

---

## 4. Summary

- **Overall:** **Pass**
- **Ready for next task:** Yes
- **Recommended next step:** Run app end-to-end (frontend + backend) to confirm runtime behavior: add receipt or demo seed, open Search tab, verify Store Analytics and Best price by store; then Profile → Reset → confirm Home and Search show $0, no stores, "No Data" where applicable.

---

## 5. Notes

- **Hardcoded data:** No `const mockPrices = [...]` or similar used in insights.tsx. All UI data comes from: (1) API (stores, totalSpent, transactions), (2) useMemo from transactions (itemPricesMap, bestPriceByItem). Empty state copy is "No Data" for Best price by store and "No store data yet" for Store Analytics.
- **Reset flow:** index.tsx → purgeAllData → triggerDashboardRefresh() (increments refreshKey). insights.tsx useEffect([refetch, refreshKey]) runs refetch; after purge, API returns empty → state and UI clear.
- **Verification method:** Static code review only; no automated tests or live run performed in this session.
