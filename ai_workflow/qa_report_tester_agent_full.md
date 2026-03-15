# QA Report – SmartBudget AI (Tester Agent – Full Verification)

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification + build)  
**Scope:** Full feature verification after all changes (Receipt Intelligence Engine, auth, Reset, Insights, Groups, Scanner, API client, local DB)

---

## 1. Build and run

| Check | Result (Pass / Fail) | Notes |
|-------|----------------------|--------|
| Backend builds (`cd backend && npm run build`) | **Pass** | `tsc` completed successfully. |
| Frontend has no linter errors | **Pass** | No linter errors on index, insights, profile, scanner. |
| Backend starts (e.g. `npm run dev` or `npm start`) | Not run | — |
| Frontend starts (e.g. `npx expo start`) | Not run | — |

---

## 2. Test cases (code verification)

| # | Test case | Steps | Expected | Result (Pass / Fail) | Notes |
|---|-----------|--------|----------|----------------------|--------|
| 1 | **Reset (Profile tab)** | Verify Reset clears Cloud + local SQLite + store | clearLocalData() and purgeAllData(authToken) in Promise.all; then setTransactions([]), setBasket([]), triggerDashboardRefresh() | **Pass** | profile.tsx handleReset (lines 52–71): Promise.all([clearLocalData(), purgeAllData(authToken)]).then(...). Reset lives in **Profile tab**, not Home. |
| 2 | **Home overlay / modal** | No crash when opening Total Spent modal | styles.overlay defined; Modal uses overlay from theme | **Pass** | index.tsx: getTheme provides overlay; Modal uses style={[styles.modalOverlay, { backgroundColor: overlay }]}. styles.overlay at line 250. |
| 3 | **Insights – refetch on API failure** | getTransactions catch does not clear store | .catch() keeps existing store so Basket/price matching still works | **Pass** | insights.tsx refetch: getTransactions(...).catch(() => { /* Keep existing store data */ }); no setTransactionsStore([]) in catch. |
| 4 | **Insights – Finalize error handling** | Finalize (Smart List + optimize) shows Alert on error | try/catch with Alert.alert("Error", message) | **Pass** | handleFinalize: catch (error) { Alert.alert("Error", message); setFinalizeFallback(true); ... }. |
| 5 | **Insights – lowest-price store** | Recommended store is lowest total, not highest | sort ascending by total | **Pass** | suggestedStore = Object.entries(basketBestStore).sort((a, b) => a[1] - b[1])[0] (ascending). |
| 6 | **Scanner – Receipt Intelligence flow** | OCR text → process-text first; fallback to from-local or from-base64 | postReceiptFromProcessText(rawText) then fallbacks | **Pass** | uploadBase64: getRawTextFromImage(base64); if rawText then postReceiptFromProcessText(authToken, rawText); on failure, from-local (localExtract) or from-base64. |
| 7 | **Backend – process-text & from-local** | Routes exist and use receipt engine | POST /process-text (rawText), POST /from-local (storeName, total) | **Pass** | receipts.ts: processReceiptText(rawText) in /process-text; /from-local creates Store + Receipt + "Fully Processed On-Device" item. |
| 8 | **Backend – transactions include store + items** | GET /api/transactions returns store and items for Basket | include: { store: true, items: true } | **Pass** | transactions.ts list: prisma.receipt.findMany include: { store: true, items: true }. |
| 9 | **Backend – auth production** | In production, dev-token or missing token → 401 | NODE_ENV === 'production' && (isDevToken \|\| !token) → 401 | **Pass** | auth middleware: isProduction && (isDevToken \|\| !token) → res.status(401).json({ error: "Unauthorized" }). |
| 10 | **Groups – create uses POST /** | createGroup calls POST /api/groups (no /create) | Backend has router.post("/") for create | **Pass** | client createGroup: fetch(`${getBaseURL()}/api/groups`, { method: "POST", ... }). groups.ts: router.post("/", ...). |
| 11 | **Group page – error + Retry** | Backend error shows message + Retry + Go back | errorMsg state; Backend Error UI; load() on Retry | **Pass** | group/[id].tsx: errorMsg, setErrorMsg in catch; if (errorMsg) show "Backend Error" + msg + Retry (setErrorMsg(null); load()) + Go back. |
| 12 | **Group page – isAdmin** | Edit/Delete only for admin | isAdmin from dashboard; button conditional | **Pass** | isAdmin = !!dashboard?.isAdmin; Edit/Delete only when isAdmin. |
| 13 | **API base URL** | Not hardcoded; env / extra | getBaseURL(): extra.apiUrl \|\| EXPO_PUBLIC_API_URL \|\| localhost:8080 | **Pass** | client.ts getBaseURL() uses expoConfig.extra.apiUrl, then process.env.EXPO_PUBLIC_API_URL, then http://localhost:8080. |
| 14 | **Local DB – Receipts** | Load local first, then fetch and save | getLocalTransactions() then getTransactions(); saveLocalTransactions(list) | **Pass** | receipts.tsx useFocusEffect: getLocalTransactions().then(...); getTransactions(authToken).then(... saveLocalTransactions(list)). |
| 15 | **Local DB – Insights** | Same pattern | getLocalTransactions() then getTransactions(); saveLocalTransactions(list) | **Pass** | insights refetch: getLocalTransactions().then(...); getTransactions(authToken).then(... saveLocalTransactions(list)). |
| 16 | **Store – expensePrefill** | Scanner can set prefill for Add Expense | setExpensePrefill({ description, amount }) after process-text | **Pass** | scanner uploadBase64: after postReceiptFromProcessText success, setExpensePrefill({ description: res?.store?.name, amount: res?.total }). useStore has expensePrefill, setExpensePrefill. |

---

## 3. Regressions / bugs

| Description | Steps to reproduce | Expected vs actual | Severity |
|-------------|--------------------|--------------------|----------|
| **Receipts tab clears list on API failure** | Receipts tab focused when backend is down or network fails | getTransactions catch sets setTransactions([]) and setTransactionsStore([]), so list goes empty. Insights keeps store on failure. | **Low** | May be intentional (Receipts = server source of truth; user sees empty until backend is back). If product wants Receipts to keep showing last local data when API fails, remove the clear in catch. |
| **PROJECT_STATE says Reset in "index.tsx"** | Doc only | PROJECT_STATE and some past QA reports refer to Reset in index.tsx. Actual Reset button is in **profile.tsx** (Profile tab). | **Doc** | Update PROJECT_STATE to say "Profile tab (profile.tsx)" for Reset. |

---

## 4. Summary

- **Overall:** **Pass**
- **Ready for next task:** Yes
- **Recommended next step:**  
  1. Run app end-to-end (backend + frontend): sign-in, scan receipt (OCR → process-text path), open Search, add basket and Finalize, Profile → Reset, confirm Home/Receipts/Search empty.  
  2. Optionally: If Receipts should keep showing last-fetched data when API fails, change receipts.tsx useFocusEffect catch to not clear store (mirror Insights behavior).  
  3. Update PROJECT_STATE to state that Reset lives in Profile tab (profile.tsx).

---

## 5. Notes (memory / changes verified)

- **Auth:** Middleware uses `where: { firebaseId: uid }`; email fallback `${uid}@firebase.local`; name/avatarUrl from decoded token; update includes name + avatarUrl; Prisma errors logged in full. Production: dev-token/missing token → 401.
- **Apple/Google:** Login modal uses expo-apple-authentication (signInAsync → identityToken) and expo-auth-session/providers/google (useIdTokenAuthRequest); idToken sent to POST /api/auth/sync; on success setUser(backendUserToStoreUser(backendUser, idToken)).
- **API client:** authHeaders(idToken) adds Bearer; getBaseURL() from extra/apiUrl or EXPO_PUBLIC_API_URL or localhost:8080; postReceiptFromProcessText, postReceiptFromLocal, postReceiptFromBase64, createSmartList, optimizeSmartList, createGroup (POST /api/groups), getGroupDashboard.
- **Receipt Intelligence:** Scanner: OCR → postReceiptFromProcessText → on failure from-local or from-base64. Backend: receipt_engine (normalize → parse → extract → categorize); POST /process-text, POST /from-local; GET /transactions includes store + items.
- **Reset:** Profile tab (profile.tsx): Promise.all([clearLocalData(), purgeAllData(authToken)]), then setTransactions([]), setBasket([]), triggerDashboardRefresh().
- **Insights:** Basket and transactions from store; refetch does not clear store on getTransactions failure; Finalize: createSmartList + optimizeSmartList with Alert on error; suggestedStore = lowest total (sort ascending).
- **Group page:** load(), errorMsg, Backend Error + Retry, isAdmin from dashboard; socket.io commented out.
- **Backend groups:** POST / for create (no /create); GET /:id/dashboard returns isAdmin, members, balances, etc.
- Verification was code review + backend build; no live device/simulator run.
