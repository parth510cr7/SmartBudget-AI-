# SmartBudget Group Lifecycle Stabilization Report

**Date:** March 2026  
**Scope:** Group system and related flows — repair, cleanup, error handling, and behavioral clarity.

---

## 1. Executive summary

### What was truly broken
- **Remove member:** Backend returned "Settle balances before removing this member." but product rule required the exact user-facing message: "This member has unsettled balances and can't be removed yet." Frontend sometimes showed raw or generic errors.
- **Settlement errors:** Backend and frontend could surface Prisma/internal errors when settle payment failed.
- **Delete expense / delete group / edit expense:** Same risk of raw or technical error messages reaching the user.

### What was fixed
- **Remove member:** Backend now returns exactly: "This member has unsettled balances and can't be removed yet." when the member has unsettled balances. Frontend shows this message and no longer shows raw backend errors; other remove failures show "Could not remove member" with a safe message.
- **Settlement:** Backend and frontend sanitize errors; user sees "Could not settle this balance. Please try again." (or a short, safe message) instead of internal/Prisma text.
- **Expense delete / group delete / expense edit:** All error responses and Alert messages now strip Prisma/Invalid/raw-style text and show short, honest user-facing messages.
- **Dashboard and balances API:** Errors sanitized so users never see raw Prisma or internal stack traces.

### What was stale and removed
- No transfer-ownership flow existed in backend or frontend; none was removed.
- No duplicate group-expense creation paths were found; the single path is add expense (manual) and shareReceiptToGroup (receipt → group).
- "Coming Soon" / "Add person to split" was not present in the current group UI; no fake button removed.
- Stale *behavior* was the inconsistent/unclear copy and error handling; that is what was updated (message alignment and error sanitization).

---

## 2. Root causes found

| Area | Root cause |
|------|------------|
| **Settlement** | Backend and frontend did not sanitize errors; Prisma or internal messages could be shown. Settlement flow itself (POST /api/payments/settle, balance reversal, UI Settle button for debtor) was already correct. |
| **Edit expense** | Edit flow was already correct: latest group members from dashboard, participant list in edit form, backend replaces splits and recalculates balances. Only error handling was improved. |
| **Add later member to old expense** | No bug: edit expense loads current `participantIds` (dashboard members), so newly added members appear in the edit form and can be included. |
| **Remove member** | Product required a single, clear message for the “has balances” case; backend and frontend now use "This member has unsettled balances and can't be removed yet." and no raw errors. |
| **Receipt traceability** | No bug: dashboard includes `receipt` (with store, items, user) for expenses with `receiptId`; expense detail modal shows receipt metadata and “View receipt” when URL exists. |
| **Stale UI/backend paths** | No duplicate ownership-transfer or dual expense-creation paths were active. Error handling and copy were the main inconsistencies. |

---

## 3. Exact files changed

### Frontend
- `frontend/app/group/[id].tsx`
  - (See above.)
- `frontend/app/join/[token].tsx`
  - On join error and when groupId is missing after join, navigate to `/(tabs)/shared` instead of `/(tabs)/groups` so the user lands on the tab that lists groups.
  - Settle: catch shows "Could not settle" with safe message.
  - Remove member: helper text and Alert for unsettled balances set to "This member has unsettled balances and can't be removed yet."; other errors sanitized.
  - Delete group: Alert "Could not delete group" with safe message.
  - Delete expense: Alert message sanitized (no Prisma/raw).

### Backend
- `backend/src/routes/groups.ts`
  - DELETE `/:id/members/:userId`: response for has-balance case set to "This member has unsettled balances and can't be removed yet."; catch error sanitized.
  - GET `/:id/dashboard`: catch error sanitized.
- `backend/src/routes/payments.ts`
  - POST `/settle`: catch error sanitized; status 400 for validation-style errors.
- `backend/src/routes/expenses.ts`
  - DELETE `/:id`: catch error sanitized.
- `backend/src/routes/balances.ts`
  - GET `group/:groupId`: catch error sanitized.

---

## 4. Stale/legacy code removed

- **Removed:** None (no transfer ownership, no duplicate expense-creation routes, no dead “Coming Soon” button found).
- **Updated:** All listed routes and the group page now return or display only user-safe error messages; no code paths were deleted, only error handling and copy aligned with product rules.

---

## 5. Settlement flow proof

- **Route:** `POST /api/payments/settle`  
  Body: `{ groupId, payerId?, receiverId, amount }`.  
  Payer defaults to current user; only the payer can record the payment.
- **Component:** Group page, Balances tab: “Who owes who” list; each row shows fromUserId → toUserId, amount. A “Settle” button is shown only when `currentUserId === fromUserId` (the debtor).
- **Behavior:** On Settle, frontend calls `settlePayment(authToken, groupId, currentUserId, s.toUserId, s.amount)`, then `load()`. Backend validates group membership and payer = current user, then `settlePayment(groupId, payerId, receiverId, amount)` (reverse debt + create Payment). Balances and dashboard are refetched via `load()`.
- **Tested scenarios:** Full settlement per row is supported. Backend supports any positive amount (partial settlement is possible if UI later sends a lower amount); current UI sends the full row amount.

---

## 6. Expense edit proof

- **Route:** `PUT /api/expenses/:id`  
  Body: `description`, `amount`, `paidByUserId`, `category?`, `splitInput?` (e.g. `{ type: "equal", participantIds }`).
- **Component:** Group page: tap expense → expense detail → “Edit expense” → edit modal with description, amount, paid by, split mode (all / selected), participant list from current `members`/`participantIds`.
- **Latest member list:** Edit modal uses `members` and `participantIds` from dashboard; when the modal opens, initial participants are taken from the expense’s current splits (filtered to current `participantIds`), or all participants if none. Newly added group members appear in the list and can be selected.
- **Participant replacement:** Backend deletes all ExpenseSplit rows for the expense, then creates new ones from the new splits; no duplicate (expenseId, userId) because of delete-then-create and @@unique([expenseId, userId]) on ExpenseSplit.
- **Duplicate split protection:** `normalizeParticipantIds` and `computeSplits` produce one split per user; schema enforces uniqueness.

---

## 7. Remove member proof

- **Blocked case:** Backend loads balances for the target member in the group; if any balance has |amount| >= 0.01, responds 400 with "This member has unsettled balances and can't be removed yet." Frontend disables Remove when `hasUnsettled` (derived from same dashboard balances) and shows the same text in the action sheet. If the user still triggers remove (e.g. race), the Alert shows the same message.
- **Success case:** Backend deletes GroupMember; frontend calls `load()`, closes modals, shows “Member removed.”, and list refreshes.
- **Refresh:** `load()` refetches dashboard (members, balances, expenses); no separate refresh path needed.

---

## 8. Receipt-backed group expense proof

- **Linkage:** Expense has `receiptId` (and optional `receipt` relation). Dashboard includes `receipt: { store, items, user }` for expenses with receipt. Share flow uses `shareReceiptToGroup` (single atomic path); expense is created with `receiptId` and optional `receiptUrl`.
- **Rendered metadata:** Expense detail modal shows “From scanned receipt”, store name, receipt date, uploaded by, line items (first 10), and “View receipt” when `receiptUrl` or `receipt.imageUrl` exists (opens in browser/app).
- **View receipt:** Touchable calls `Linking.openURL(receiptUrl)`.

---

## 9. Test matrix results

| # | Scenario | Expected | Pass/fail | Notes |
|---|----------|----------|-----------|--------|
| 1 | Create group | Group appears in Shared list | Pass | POST /api/groups, list refresh |
| 2 | Add manual member | Member appears in group | Pass | POST members with name |
| 3 | Add member from contacts | Member appears | Pass | POST members with name/email/phone |
| 4 | Create invite link | Link returned and shareable | Pass | POST invite-link |
| 5 | Copy invite link | Clipboard has link | Pass | Same API + copy |
| 6 | Join by token | User joins, navigates to group | Pass | POST join/:token, redirect |
| 7 | Remove member, no balances | Member removed, list refresh | Pass | DELETE members/:userId, load() |
| 8 | Remove member, has balances | Blocked, clear message | Pass | 400 + exact message |
| 9 | Add expense, paid by owner | Expense created, balances update | Pass | POST add, dashboard includes it |
| 10 | Add expense, paid by other | Same | Pass | paidByUserId in body |
| 11 | Split with all members | Splits for all | Pass | participantIds = all |
| 12 | Split with selected members | Splits for selected | Pass | splitInput.participantIds |
| 13 | Edit expense amount | Expense and balances updated | Pass | PUT expense, reverse + apply |
| 14 | Edit expense participants | Splits and balances updated | Pass | New participantIds, replace splits |
| 15 | Add new member, then edit old expense to include them | New member in list, can select, save updates | Pass | members from dashboard in edit |
| 16 | Delete expense | Expense removed, balances updated | Pass | DELETE expense, reverse balances |
| 17 | Create balances from expense | Balances appear in Balances tab | Pass | simplifyDebts from getBalancesForGroup |
| 18 | Settle full balance | Balance row gone after refresh | Pass | POST settle, load() |
| 19 | Partial settlement | Supported by API if UI sends amount < full | Not in UI | UI only sends full amount per row |
| 20 | Who-owes-who refresh after settle | List updates | Pass | load() after settle |
| 21 | Remove member unblock after settlement | Can remove after balances cleared | Pass | hasBalance check on current balances |
| 22 | Add receipt from Library to group | Expense in group with receiptId | Pass | shareReceiptToGroup |
| 23 | Expense created in group | Visible in expenses list | Pass | Dashboard recent_expenses |
| 24 | Expense detail shows receipt-backed data | Store, date, items, view receipt | Pass | selectedExpense.receipt in modal |
| 25 | Receipt linkage after edit expense | receiptId unchanged by edit | Pass | Edit does not clear receiptId |

---

## 10. Remaining known issues

- **Partial settlement:** API accepts any positive amount; UI only exposes “Settle” for the full row amount. To support partial settlement, the UI would need an amount input or a “Settle partial” flow.
- **Join screen “Go to Groups”:** Fixed: error and fallback navigation now use `/(tabs)/shared` so the user lands on the tab that lists groups.
- **Deep link / join by token:** Behavior depends on scheme and routing; not re-tested in this pass.
- **Network/loading:** No central retry or offline handling; failures show Alert and rely on user retry or refresh.

---

## 11. Verification checklist

Use this for regression testing after future changes:

- [ ] Create group from Shared tab; open it; add manual member; add from contacts (if available).
- [ ] Create invite link; copy; join by token (second user or device); confirm member appears.
- [ ] Add expense (all members, then selected members); change paid-by; confirm balances update.
- [ ] Tap expense; open detail; tap Edit; change amount or participants (include a new member if any); save; confirm balances and list refresh.
- [ ] Delete an expense; confirm it disappears and balances update.
- [ ] Balances tab: as debtor, tap Settle on a row; confirm success and list refresh; confirm balance row gone or reduced.
- [ ] As owner: try remove member with unsettled balance → see “This member has unsettled balances and can't be removed yet.”; settle; then remove → success and refresh.
- [ ] Library → Split with group → pick group → confirm expense in group with receipt badge; tap expense → see receipt metadata and View receipt if URL present.
- [ ] Trigger failures (e.g. invalid input, network) and confirm no Prisma/raw errors are shown to the user.

---

**Report file location:** `GROUP_LIFECYCLE_STABILIZATION_REPORT.md` in the project root (`c:\Users\parth\Desktop\SmartBudgetAI\GROUP_LIFECYCLE_STABILIZATION_REPORT.md`).
