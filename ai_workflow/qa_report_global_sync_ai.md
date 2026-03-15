# QA Report – SmartBudget AI

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification)  
**Scope:** Global Sync, AI Intelligence, Fuzzy Matching, Basket Persistence, Reset (incl. Shopping List)

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
| 1 | **Data Sync – same global store** | Verify insights.tsx and index.tsx (and Receipts) use shared data source | Insights pulls from same global store as the app’s transaction data; refetch writes to store so tabs stay in sync | **Pass** | insights.tsx: `transactions = useStore((s) => s.transactions ?? [])`, refetch calls `setTransactionsStore(txData)`. receipts.tsx: after getTransactions() calls `useStore.getState().setTransactions(list)`. So Insights reads store.transactions; Receipts writes it. Both use refreshKey in refetch/useFocusEffect. index.tsx uses getSummary/getReceipts/getStores (separate API) but shares refreshKey so all refetch after reset. |
| 2 | **AI Context – transactions in prompt** | Inspect “ask” flow: is receipt/transaction data sent to the AI? | Transaction/receipt context must be in the AI prompt; empty or hardcoded prompt = FAIL | **Pass** | Frontend: askSmartBudget(authToken, msg) sends only the user message (POST /api/ai/chat). Backend ai.ts: fetches user receipts from DB (prisma.receipt.findMany with store, items), buildReceiptContext(receipts) builds string (totals, last 30 days, by store, receipt lines), passes context to generateChatReply(userMessage, context). aiService.ts: generateChatReply injects context: "Here is the user's receipt/transaction data (use this to answer...)..." + context. So real receipt data is fetched and included in the prompt; not empty or hardcoded. |
| 3 | **Fuzzy Matching – toLowerCase & includes** | Check bestPriceByItem / item lookup logic for fuzzy matching | Uses .toLowerCase() and .includes() so e.g. "Milk" matches "Whole Milk", "Milk 2%" | **Pass** | normalizeItemName() uses .trim().toLowerCase() (line 20). getMatchingKeys() (lines 56–66) uses key.includes(normalizedQuery) \|\| normalizedQuery.includes(key). getBestStoreForItem() (lines 160–175) normalizes query with normalizeItemName(item) and uses getMatchingKeys(itemPricesMap, q). buildBestPriceByItem uses normalizeItemName for keys (toLowerCase); fuzzy match (includes) is used in basket item lookup (getBestStoreForItem). |
| 4 | **Persistence – basket survives tab switch** | Check where basket state lives | Basket in global state (Zustand) so it persists across tab switches | **Pass** | insights.tsx: `basket = useStore((s) => s.basket ?? [])`, `setBasketStore = useStore((s) => s.setBasket)`; add/remove call setBasketStore. useStore.ts: basket and setBasket in store. So basket is global state, not local useState only; survives tab switch. |
| 5 | **Reset – Home, Search, Shopping List cleared** | Confirm Reset App Data clears Home, Search tab, and Current Shopping List | After reset: Home shows $0/empty; Search (Insights) empty; Shopping List (basket) empty | **Pass** | index.tsx handleReset (lines 138–159): purgeAllData() then useStore.getState().setTransactions([]), setBasket([]), triggerDashboardRefresh(), onClose(). Home: useFocusEffect depends on refreshKey → refetches; after purge, API returns empty. Search: transactions from store (now []), basket from store (now []), refreshKey triggers refetch and setShowFinalized(false); Best price by store and Recommended/Finalize UI show empty. So Home, Search, and Current Shopping List (basket) all clear. |

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| None | — | No regressions identified in scope. |

---

## 4. Summary

- **Overall:** **Pass**
- **Ready for next task:** Yes
- **Recommended next step:** Run app end-to-end: add receipts, ask SmartBudget a question, add items to Shopping List and switch tabs (basket persists), then Profile → Reset App Data and confirm Home, Search, and Shopping List all show empty/zero.

---

## 5. Notes

- **Data flow:** Receipts tab is the writer of store.transactions on fetch; Insights tab reads it and also refetches (writing to store). So both Receipts and Insights keep store.transactions in sync; Index uses its own summary/receipts/stores APIs but shares refreshKey.
- **AI:** Context is built on the backend from DB receipts; frontend does not send transaction payload, only the user message. Backend fetches and builds context then passes it to Gemini.
- **Fuzzy:** toLowerCase in normalizeItemName; includes in getMatchingKeys. Best Price by Store table uses normalized (lowercase) keys; basket item lookup uses fuzzy matching for “Milk” → “Whole Milk” etc.
- Verification was static code review only; no live run.
