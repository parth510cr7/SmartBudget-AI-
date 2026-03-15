# QA Report – SmartBudget AI

**Date:** _______________  
**Build / branch:** _______________  
**Scope (e.g. overlay fix + Search tab):** _______________

---

## 1. Build and run

| Check | Result (Pass / Fail) | Notes |
|-------|----------------------|--------|
| Backend builds (`cd backend && npm run build`) | | |
| Frontend has no linter errors | | |
| Backend starts (e.g. `npm run dev` or `npm start`) | | |
| Frontend starts (e.g. `npx expo start`) | | |

---

## 2. Test cases

| # | Test case | Steps | Expected | Result (Pass / Fail) | Notes |
|---|-----------|--------|----------|----------------------|--------|
| 1 | Profile modal opens without crash | Open Home → tap profile icon → open Settings modal | Modal opens; no "Property overlay doesn't exist" (or similar) error | | |
| 2 | Search tab – stores visited | Add a receipt (Scan) or load demo (Profile); open Search tab | "Stores visited" shows correct count (e.g. > 0) | | |
| 3 | Search tab – total spent | Same as above | "Total spend" shows correct amount (e.g. > $0) | | |
| 4 | Search tab – best price by store | Same as above; scroll to "Best price by store" | Table shows items from receipts or "No data available" if none | | |
| 5 | Reset clears data | Profile → Reset App Data → confirm; open Home and Search | Home and Search show zero/empty (e.g. $0.00, no stores, no best price rows) | | |
| 6 | Existing flows (regression) | Use Home, Scan, Receipts, Profile (sign in/out, reset) | No new crashes; existing behavior unchanged | | |

*(Add or remove rows as needed for the current scope.)*

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| (None / or list any new bugs found) | | |

---

## 4. Summary

- **Overall:** Pass / Fail / Partial  
- **Ready for next task:** Yes / No  
- **Recommended next step:** _______________

---

## 5. Notes

(Optional: environment, device/simulator, API base URL used, etc.)
