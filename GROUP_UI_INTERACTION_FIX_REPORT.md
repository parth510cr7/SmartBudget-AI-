# Group UI Interaction Fix Report

## 1. Root cause of non-responsive "Paid by"

- **Exact active component:** Add Expense modal in `frontend/app/group/[id].tsx` (single `<Modal visible={addExpenseVisible}>` and the sheet/content inside it).
- **Exact cause:** The entire sheet (including the "Paid by" row) was rendered **inside** a single full-screen `TouchableOpacity` used as the overlay. That overlay’s `onPress` closed the Add Expense modal. So a tap on "Paid by" was treated as a tap on the overlay first, firing `setAddExpenseVisible(false)` and closing the modal before the Paid-by picker could open. The "Paid by" control was wired correctly (`onPress` → `setPaidByPickerContext("add"); setPaidByPickerVisible(true)`), but the parent overlay was consuming the touch.
- **Exact fix:** The overlay is no longer a `TouchableOpacity` that wraps the sheet. The modal content is now a wrapper `View` with two siblings: (1) a `TouchableOpacity` with `style={StyleSheet.absoluteFill}` and the same `onPress` (close on backdrop tap only), and (2) the sheet `View` as the second child. Taps on the sheet (including "Paid by") hit the sheet content; only taps on the dimmed backdrop close the modal.

## 2. Root cause of missing remove-member action

- **Exact active component:** Member action sheet in the same file `frontend/app/group/[id].tsx` (`<Modal visible={memberActionMember !== null}>` and the bottom sheet that shows "View details", "Remove from group", "Done").
- **Exact cause:** Same layout bug as above. The member action sheet content was rendered **inside** a full-screen `TouchableOpacity` whose `onPress` set `setMemberActionMember(null)` (close sheet). Tapping "Remove from group" or "View details" was treated as a tap on that overlay, closing the sheet before the inner button’s action could run. The remove option was present and correctly gated (e.g. unsettled balances message, owner-only message), but the overlay was swallowing the tap.
- **Exact fix:** Same pattern: the modal content is now a wrapper `View` with (1) a backdrop-only `TouchableOpacity` with `StyleSheet.absoluteFill` and `onPress={() => setMemberActionMember(null)}`, and (2) the sheet `View` as a sibling. Taps on "Remove from group" and "View details" now hit the sheet content; only backdrop taps close the sheet.

## 3. Stale or duplicate components found

- **Exact files:** None.
- **What was removed / bypassed:** No duplicate Add Expense or member-list/member-action components were found. The only Add Expense modal and the only member action sheet are in `frontend/app/group/[id].tsx`. No stale components were removed; only the **layout** of the two modals was changed (overlay no longer wraps sheet content).

## 4. Exact files changed

- `frontend/app/group/[id].tsx`
  - Add Expense modal: replaced overlay `TouchableOpacity` wrapping the sheet with a wrapper `View` + `TouchableOpacity` (absoluteFill) + sheet `View`.
  - Member action sheet: same change (wrapper `View` + backdrop `TouchableOpacity` (absoluteFill) + sheet `View`).

## 5. Proof of active behavior

- **Paid by:** The same handler as before now runs: tapping the "Paid by" row still calls `setPaidByPickerContext("add"); setPaidByPickerVisible(true)`. Previously that tap was absorbed by the parent overlay and closed the Add Expense modal. Now the tap reaches the row’s `TouchableOpacity`, so the payer picker modal opens. Selecting a member still sets `expensePaidByUserId` and closes the picker; expense creation still uses that value.
- **Member action sheet:** The same handlers as before now run: tapping "View details" or "Remove from group" no longer closes the sheet because those taps hit the sheet’s buttons instead of the overlay. "Remove from group" runs the existing remove/confirmation logic; "Done" and backdrop tap still close via the backdrop `TouchableOpacity` and the Done button.
- **Active path:** The only Add Expense UI and the only member action sheet are in `[id].tsx`; there are no other code paths that render these modals. The same components are now responsive because the touch hierarchy no longer blocks sheet content.

## 6. Manual test checklist

- [ ] **Paid by:** Tap "Paid by" in Group → Add Expense → picker (modal/sheet) opens.
- [ ] **Paid by:** Choose another member as payer → selection updates in the row; save expense → expense is stored with that payer.
- [ ] **Paid by:** Save expense with non-owner as payer and confirm split/participants still work.
- [ ] **Members:** Tap a member row in Group → Members → member action sheet opens (View details / Remove from group / Done).
- [ ] **Members:** See "Remove from group" for a non-owner member (and "Only the group owner can remove members" when current user is not owner).
- [ ] **Members:** For a member with unsettled balances → message like "This member has unsettled balances and can't be removed yet" and remove disabled or blocked; for a member with no unsettled balances → confirmation → remove → member disappears and list refreshes.
- [ ] **Members:** Owner remains clearly indicated; no transfer-ownership flow required.
