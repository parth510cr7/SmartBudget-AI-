# QA Report – SmartBudget AI

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification)  
**Scope:** Receipt Intelligence Engine & Learning Loop – categoryEngine, receiptParser, aiCategorizer, frontend localDb (SQLite), Reset behavior

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
| 1 | **Logic – user_rules before AI** | Inspect categoryEngine.ts: does it check user_rules.json before calling AI? | AI (categorizeWithAI) is called only after (1) User Rules, (2) Store Category, (3) Item Dictionary, (4) Fuse fuzzy match are tried | **Pass** | categorizeItem() (lines 118–137): (1) matchUserRules(itemName) – returns if hit; (2) matchStoreCategory(storeName); (3) matchItemDictionary(itemName); (4) matchFuzzy(itemName); (5) only then await categorizeWithAI(itemName). getUserRules() loads user_rules.json (cached). So user_rules is checked first; AI is fallback. |
| 2 | **Parsing – total '$12.08'** | Check receiptParser.ts TOTAL_PATTERNS for $ prefixed total | A line like "TOTAL $12.08" yields total 12.08 | **Pass** | First pattern: `/\b(?:total|amount\s+due|balance\s+due|grand\s+total)\s*\$?\s*(\d+\.\d{2})/i`. Optional `\$?` allows "TOTAL $12.08"; capture group is "12.08". extractFirstMatch returns 12.08. Fallback: normalized.amounts (from receiptNormalizer CURRENCY_REGEX) so standalone $ amounts elsewhere in text also contribute. |
| 3 | **Parsing – total 'TOTAL 12.08'** | Check receiptParser for total without $ | A line like "TOTAL 12.08" yields total 12.08 | **Pass** | Same pattern: `\s*\$?\s*(\d+\.\d{2})` – $ is optional. "TOTAL 12.08" matches; group 1 = "12.08". Handled correctly. |
| 4 | **Learning Loop – write back to user_rules** | Verify aiCategorizer.ts writes to user_rules.json after successful AI call | After Gemini returns a category, save mapping to user_rules.json | **Pass** | categorizeWithAI() (aiCategorizer.ts): calls model.generateContent(...), parses category, then `if (key) saveUserRule(key, category)` (lines 78–79). saveUserRule() loads existing rules, sets rules[key]=value, fs.writeFileSync(getUserRulesPath(), JSON.stringify(rules, null, 2)). So every successful AI categorization is persisted to user_rules.json. |
| 5 | **Persistence – localDb on fetch** | Confirm frontend localDb (SQLite) is updated when receipts are fetched | When getTransactions is called, results are saved to local DB | **Pass** | receipts.tsx: getTransactions(authToken).then((data) => { const list = data ?? []; saveLocalTransactions(list); ... }). insights.tsx: getTransactions(authToken).then((txData) => { const list = Array.isArray(txData) ? txData : []; saveLocalTransactions(list); setTransactionsStore(list); }). Both tabs call saveLocalTransactions() with the fetched list. localDb.saveLocalTransactions() replaces all rows in the transactions table. |
| 6 | **Reset – SQLite wiped** | Confirm Reset button wipes the SQLite database | Reset clears local transaction data (or deletes DB) | **Pass** | index.tsx handleReset: Promise.all([clearLocalData(), purgeAllData(authToken)]). clearLocalData() (localDb.ts) runs DELETE FROM transactions (or opens DB and deletes). So Reset wipes the SQLite transaction table. deleteLocalDatabase() exists but is not called on Reset (only clearLocalData); data is wiped, schema remains. |
| 7 | **Reset – user_rules.json wiped (optional)** | Confirm Reset wipes user_rules.json on backend (optional/preferred) | Preferably Reset also clears or resets user_rules.json | **Fail** | purge/all (transactions.ts) only runs prisma.receipt.deleteMany({ where: { userId: user.id } }). No backend code touches data/user_rules.json on purge. user_rules.json lives under backend/data/ and is never cleared by any route. So Reset does **not** wipe user_rules.json. Recommended: add a step in purge/all (or a dedicated endpoint) to clear or reset user_rules.json if product prefers a full reset of learned rules. |

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| user_rules.json not cleared on Reset | Profile → Reset App Data → confirm. Then upload a receipt that triggers categorization. | Preferred: learned rules (user_rules.json) also reset so categorization starts fresh. Actual: user_rules.json is unchanged; only receipts and frontend SQLite are cleared. |

---

## 4. Summary

- **Overall:** **Partial** (one optional requirement not met: Reset does not wipe user_rules.json)
- **Ready for next task:** Yes, with recommendation below
- **Recommended next step:** If product wants “full reset” to include learned categories: (1) Add backend logic (e.g. in purge/all or a small receipt_engine helper) to clear or reset `data/user_rules.json` when purge runs, or (2) Add an optional API e.g. DELETE /api/user/rules or a query param on purge to clear rules. Then have the frontend call it as part of Reset when desired.

---

## 5. Notes

- **receipt_engine:** Pipeline is normalizeReceiptText → parseReceiptMeta → extractItems → categorizeItem (user rules → store → dictionary → fuzzy → AI). categoryEngine invalidates caches after AI so new rule is visible on next item.
- **receiptParser:** TOTAL_PATTERNS and SUBTOTAL_PATTERNS use `\$?` so both "TOTAL 12.08" and "TOTAL $12.08" work. receiptNormalizer extracts all $ amounts into normalized.amounts; parseReceiptMeta uses that as fallback for total.
- **aiCategorizer:** saveUserRule() creates data dir if needed (fs.mkdirSync recursive) and writes JSON. Path: backend/data/user_rules.json (from receipt_engine __dirname).
- **localDb:** receipts and insights both load from getLocalTransactions() first (instant), then fetch getTransactions() and saveLocalTransactions(list). Reset calls clearLocalData() before purgeAllData().
- Verification was static code review only; no live run.
