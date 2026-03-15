# Shared Tab — Logic, Structure & Debugging Guide

**Purpose:** This document describes the **Shared** tab and all related flows (groups, invite, add member, receipt sharing, join by link) so another LLM or developer can inspect the code and fix issues. Include every detail needed to find where things get stuck.

**Last updated:** March 2026.

---

## 1. What the Shared Tab Is

- **Route:** `(tabs)/shared` — screen name `shared`, title "Shared" in tab bar.
- **Role:** Lists the current user’s **groups** (Splitwise-style). User can create groups, open a group, invite people (link / contacts / manual), and delete groups they own.
- **Not:** The Shared tab does **not** show “shared prices” or “shared receipts” as a list; those appear inside a **group** (group dashboard) and in the **Library** modal when splitting a receipt to a group.

---

## 2. File Structure (All Relevant Files)

| Purpose | Path |
|--------|------|
| **Shared tab UI** | `frontend/app/(tabs)/shared.tsx` |
| **Tab layout** (register Shared) | `frontend/app/(tabs)/_layout.tsx` |
| **Group dashboard** (opened from Shared) | `frontend/app/group/[id].tsx` |
| **Join by invite token** | `frontend/app/join/[token].tsx` |
| **Library modal** (receipt → split to group) | `frontend/app/modal/library.tsx` |
| **Root layout** (Stack: group, join) | `frontend/app/_layout.tsx` |
| **API client** (groups, invite, join) | `frontend/src/api/client.ts` |
| **Backend groups routes** | `backend/src/routes/groups.ts` |
| **Backend receipts** (share-to-group) | `backend/src/routes/receipts.ts` |
| **Receipt share service** | `backend/src/services/receiptShareService.ts` |
| **App scheme** (deep link) | `frontend/app.json` → `"scheme": "smartbudget"` |

---

## 3. Shared Tab Screen — Logic & State

**File:** `frontend/app/(tabs)/shared.tsx`

### 3.1 State

| State | Type | Purpose |
|-------|------|--------|
| `groups` | `GroupRow[]` | List of groups from API |
| `loading` | `boolean` | Initial/refresh loading |
| `error` | `string \| null` | Error message if `getGroups` fails |
| `createModalVisible` | `boolean` | “New group” modal open/closed |
| `newGroupName` | `string` | Input for group name |
| `groupType` | `"Office" \| "Trip" \| "Party" \| "Other"` | Selected type in create modal |
| `creating` | `boolean` | Create request in progress |
| `inviteOptionsGroupId` | `string \| null` | When set, shows “Invite to group” bottom sheet for that group |
| `inviteLinkLoading` | `boolean` | Creating invite link (Share or Copy) |
| `glowAnim` | `Animated.Value` | Siri-style glow in create modal |

### 3.2 Auth / Token

- `authToken = useStore((s) => (s.user as { idToken?: string } \| null)?.idToken ?? null)`
- `safeToken = authToken || "dev-token"` — used for all API calls.

### 3.3 Data Loading

- **Function:** `load = useCallback(async () => { ... }, [safeToken])`
  - Sets `loading` true, `error` null.
  - Calls `getGroups(safeToken)`.
  - On success: `setGroups(Array.isArray(list) ? list : [])`.
  - On catch: `setError(msg)`, `setGroups([])`.
  - Finally: `setLoading(false)`.
- **When:** `useFocusEffect(useCallback(() => { load(); }, [load]))` — runs every time the Shared tab gains focus.

### 3.4 Create Group

- **Trigger:** “Create New Group” button → `setCreateModalVisible(true)`.
- **Submit:** `handleCreateGroup`
  - Validates `newGroupName.trim()`; if empty, `Alert.alert("Missing", "Enter a group name.")`.
  - `setCreating(true)`, then `createGroup(safeToken, name, groupType)`.
  - On success: `setNewGroupName("")`, `setCreateModalVisible(false)`, `load()`.
  - On failure: `Alert.alert("Error", ...)`.
  - `finally`: `setCreating(false)`.

### 3.5 Delete Group

- **Trigger:** Trash icon on a group card → `Alert.alert("Delete group", ...)` with “Delete” calling `handleDeleteGroup(g.id)`.
- **handleDeleteGroup:** `deleteGroup(safeToken, groupId)` then `setGroups((prev) => prev.filter((g) => g.id !== groupId))`. On catch, `Alert.alert("Delete Failed", ...)`.
- **Note:** Only groups the user **owns** can be deleted (backend enforces `group.ownerId !== user.id` → 403).

### 3.6 Open Group

- **Trigger:** Tapping the main area of a group card (not the icons).
- **Action:** `router.push(\`/group/${g.id}\`)` — navigates to group dashboard.

### 3.7 Invite Options Sheet

- **Trigger:** Plus icon on a group card → `setInviteOptionsGroupId(g.id)`.
- **Modal:** `visible={!!inviteOptionsGroupId}`, content only when `inviteOptionsGroupId` is set.

**Four options:**

1. **Share link**
   - `setInviteLinkLoading(true)`.
   - `createGroupInviteLink(safeToken, inviteOptionsGroupId)` → `{ token, inviteUrl }`.
   - Deep link: `smartbudget://join/${token}`.
   - `Share.share({ message: "Join my SmartBudget group: " + deepLink, url: deepLink, title: "Invite to group" })`.
   - On success: `setInviteOptionsGroupId(null)`.
   - On error: `Alert.alert("Invite", ...)`.
   - `finally`: `setInviteLinkLoading(false)`.

2. **Copy link**
   - Same API call; then `Clipboard.setStringAsync("App: " + deepLink + "\nWeb: " + inviteUrl)`.
   - `Alert.alert("Link copied", ...)`, `setInviteOptionsGroupId(null)`.

3. **Add from Contacts**
   - `setInviteOptionsGroupId(null)` then `router.push(\`/group/${inviteOptionsGroupId}?openAdd=contacts\`)`.
   - **Bug risk:** `inviteOptionsGroupId` is cleared **before** `router.push`, so the URL may be `/group/undefined?openAdd=contacts`. The correct pattern is to pass the id in the URL, e.g. `router.push(\`/group/${g.id}?openAdd=contacts\`)` using the group id from the card, or store the id in a ref and use it in the push.

4. **Add manually**
   - Same as above with `?openAdd=manual`.
   - Same bug risk: after `setInviteOptionsGroupId(null)`, `inviteOptionsGroupId` is null when used in `router.push`.

**Where to fix:** In `shared.tsx`, for “Add from Contacts” and “Add manually”, use the group id **before** clearing it, e.g.:

```ts
const groupId = inviteOptionsGroupId;
setInviteOptionsGroupId(null);
if (groupId) router.push(`/group/${groupId}?openAdd=contacts`);
```

(And similarly for manual.)

### 3.8 UI Structure (Shared Tab)

- If `loading`: full-screen `ActivityIndicator`.
- Else: header (“Shared” + “Create New Group” button), then either:
  - **Error block:** `error` message + Retry button (`load()`).
  - **FlatList:** `data={groups}`, `keyExtractor={(g) => g.id}`, empty state “No groups yet…”, `renderItem` = group card.
- Group card: main touchable (navigate to `/group/${g.id}`), Trash touchable, Plus touchable (invite sheet).
- Two modals: Invite options sheet (bottom), Create group modal (center, with glow animation).

---

## 4. Group Page — How It Receives “Add Person” from Shared

**File:** `frontend/app/group/[id].tsx`

### 4.1 Params

- `const { id, openAdd } = useLocalSearchParams<{ id: string; openAdd?: string }>();`
- `id` = group id (from `/group/[id]` or `/group/[id]?openAdd=...`).

### 4.2 Opening Add-Person Modals from Shared

- **Effect:**

```ts
useEffect(() => {
  if (!id || !openAdd) return;
  if (openAdd === "contacts") setAddPersonContactsVisible(true);
  else if (openAdd === "manual") setAddPersonManualVisible(true);
}, [id, openAdd]);
```

- So when user lands on `/group/<id>?openAdd=contacts` or `?openAdd=manual`, the group page sets the corresponding modal visible.
- **If Shared tab passes `undefined` as id** (due to clearing `inviteOptionsGroupId` before push), the group route might be `/group/undefined` and `id` will be the string `"undefined"`; dashboard fetch will fail (404 or bad request). **This is a prime place to get stuck.**

### 4.3 Add Member — Manual

- Modal: `addPersonManualVisible`, input `newMemberName`.
- Submit: `addGroupMember(safeToken, id, { name })` (backend expects `name` or `email`). Then `load()`, show `inviteFeedback`, close modal.

### 4.4 Add Member — Contacts

- Modal: `addPersonContactsVisible`.
- On open (from Invite sheet “Invite with link” / Contacts on **group page**): contacts are loaded (expo-contacts), then user picks a contact; `addGroupMember(safeToken, id, { name, email: item.email, phone: item.phone })`.
- **Note:** When arriving via `?openAdd=contacts` from Shared, the group page doesn’t pre-open the invite sheet; it only opens the **contacts** modal. So the flow is: Shared → Plus → “Add from Contacts” → navigate to group with `openAdd=contacts` → group page opens contacts modal. If `id` is wrong, add-member API will fail.

---

## 5. Invite Link & Join Flow

### 5.1 Creating the Link (Backend)

- **Route:** `POST /api/groups/:id/invite-link`
- **File:** `backend/src/routes/groups.ts`
- **Auth:** Required. User must be group **admin** (owner or member with role ADMIN).
- **Logic:** Generate `token` (crypto.randomBytes(16).hex()), `expiresAt` = now + 7 days, insert `GroupInviteLink`, return `{ inviteUrl, token, expiresAt }`. `inviteUrl` is built from `req.get("origin")` or `req.get("referer")` or `"https://smartbudget.ai"`, then `${baseUrl}/join/${token}`.

### 5.2 Frontend — Create Link

- **API:** `createGroupInviteLink(idToken, groupId)` → `Promise<{ inviteUrl: string; token: string; expiresAt: string }>`.
- **Request:** `POST ${getBaseURL()}/api/groups/${groupId}/invite-link`, headers `authHeaders(idToken)`.

### 5.3 Deep Link

- **Scheme:** `app.json` has `"scheme": "smartbudget"`.
- **URL used in app:** `smartbudget://join/${token}`.
- **Expo Router:** Route is `join/[token]`, so the path is `/join/<token>`. For the scheme to open the app and navigate to this screen, the app must handle `smartbudget://join/<token>` and map it to `/join/[token]`. Expo Linking typically does this when the scheme and path match the file-based route.

### 5.4 Join Screen

**File:** `frontend/app/join/[token].tsx`

- **Params:** `const { token } = useLocalSearchParams<{ token: string }>();`
- **Effect (once):**
  - If no `token`: `setStatus("error")`, `setMessage("Invalid invite link.")`.
  - If no `authToken`: `setStatus("error")`, `setMessage("Please sign in to join a group.")`.
  - Else: `joinGroupByToken(authToken, token)`.
    - Success: `setStatus("success")`, then after 800ms `router.replace(\`/group/${groupId}\`)` or `router.replace("/(tabs)/groups")` if no groupId.
    - Failure: `setStatus("error")`, `setMessage(...)`.
- **API:** `joinGroupByToken(idToken, token)` → `POST /api/groups/join/${token}`, returns `{ message, groupId }`.
- **Note:** Error screen "Go to Groups" uses `router.replace("/(tabs)/groups")`; the tab that lists groups is **Shared** (`/(tabs)/shared`). If the "groups" tab is hidden or missing, use `router.replace("/(tabs)/shared")` instead.

### 5.5 Backend Join

- **Route:** `POST /api/groups/join/:token`
- **Logic:** Resolve invite by token, check not expired, check user not already member, then `GroupMember.create`. Returns `{ message, groupId }`.

**Where to get stuck:**

- Deep link not opening app (scheme not registered on device, or path not mapped to `/join/[token]`).
- `token` param missing or wrong (e.g. web fallback URL format different from in-app scheme).
- Join screen uses `router.replace("/(tabs)/groups")` on error; there is no tab named `groups` in the tab layout (tabs are index, insights, scan, shared, etc.). So “Go to Groups” might navigate to a non-existent or wrong tab. **Prefer `router.replace("/(tabs)/shared")`** for “groups” list.

---

## 6. API Client — Groups & Invite (Exact Signatures)

**File:** `frontend/src/api/client.ts`

- **getGroups(idToken):** `GET /api/groups` → `GroupRow[]`. `GroupRow = { id, name, createdAt, isOwner }`.
- **createGroup(idToken, name, type):** `POST /api/groups`, body `{ name, type }`, type must be one of Office/Trip/Party/Other → `GroupRow`.
- **deleteGroup(idToken, groupId):** `DELETE /api/groups/:id` → 200.
- **createGroupInviteLink(idToken, groupId):** `POST /api/groups/:id/invite-link` → `{ inviteUrl, token, expiresAt }`.
- **joinGroupByToken(idToken, token):** `POST /api/groups/join/:token` → `{ message, groupId }`.
- **getGroupDashboard(idToken, groupId):** `GET /api/groups/:id/dashboard` → `GroupDashboardResponse` (group, members, recent_expenses, balances, etc.).
- **addGroupMember(idToken, groupId, body):** `POST /api/groups/:id/members`, body `{ email?, name?, phone? }` (at least one of email or name).
- **removeGroupMember(idToken, groupId, userId):** `DELETE /api/groups/:id/members/:userId`.
- **shareReceiptToGroup(receiptId, groupId, idToken, participantIds?):** `POST /api/receipts/:receiptId/share-to-group`, body `{ groupId, participantIds? }` → `{ expenseId, alreadyShared }`.

Base URL: `getBaseURL()` (from app config / `EXPO_PUBLIC_API_URL` or default `http://localhost:8080`). Auth: `Authorization: Bearer ${idToken || "dev-token"}`.

---

## 7. Backend Groups Routes Summary

**File:** `backend/src/routes/groups.ts`

| Method | Path | Purpose |
|--------|------|--------|
| GET | / | List user’s groups (owned + member of) |
| POST | / | Create group (body: name, type) |
| GET | /:id/dashboard | Full dashboard (members, expenses, balances, etc.) |
| GET | /:id | Group detail (for getGroup) |
| DELETE | /:id | Delete group (owner only) |
| POST | /:id/invite-link | Create invite link (admin only) |
| POST | /join/:token | Join group by token |
| POST | /:id/members | Add member (body: email or name) |
| DELETE | /:id/members/:userId | Remove member (owner only, no unsettled balances) |
| GET | /:id/members/:userId/details | Member details (e.g. groupsCount) |
| POST | /:id/leave | Leave group (non-owner, no balances) |

---

## 8. Library Modal — “Split with Group” (Receipt → Group)

**File:** `frontend/app/modal/library.tsx`

- **Entry:** Opened from elsewhere (e.g. group page or a “Library” entry point); not from the Shared tab directly.
- **Flow:** User selects a receipt → “Split with Group” → modal shows list of groups (`getGroups`), user picks a group → `getGroupDashboard(authToken, g.id)` to load members → user can choose “all” or selected members → “Split receipt” calls `shareReceiptToGroup(splitModalReceipt.id, selectedGroup.id, authToken, ids)`.
- **Backend:** `POST /api/receipts/:id/share-to-group`, body `{ groupId, participantIds? }`. Service: `receiptShareService.shareReceiptToGroup` (atomic: create expense, splits, balances, link receipt to group). Idempotent: if receipt already shared to that group, returns `{ alreadyShared: true }`.
- **Where to get stuck:** Wrong `participantIds` (e.g. using member ids that don’t match backend), or backend validation (e.g. participantIds must be group members). Library passes `participantIdsFromMembers` from dashboard members.

---

## 9. Navigation Summary

- **Shared tab** → “Create New Group” → create modal → on success, list refreshes.
- **Shared tab** → group card tap → `/group/[id]` (group dashboard).
- **Shared tab** → Plus on card → Invite sheet → “Share link” / “Copy link” / “Add from Contacts” / “Add manually”.
  - Share/Copy: create link, then share or copy; no navigation.
  - Add from Contacts / Add manually: **navigate to `/group/[id]?openAdd=contacts` or `?openAdd=manual`**. Critical that `[id]` is the **same** group id (not cleared before push).
- **Group page** → “Add member” → Invite sheet (same as group’s own invite flow) or directly manual/contacts if opened with `openAdd`.
- **Join link** (e.g. `smartbudget://join/<token>`) → `/join/[token]` → join API → `router.replace(\`/group/${groupId}\`)` or `/(tabs)/groups` (should be `/(tabs)/shared`).
- **Group page** → Leave group → `router.replace("/(tabs)/shared")`.
- **Group page** → Delete group (admin) → after delete, typically navigate back; implementation may use `router.replace("/(tabs)/shared")` or similar.

---

## 10. Known Issues / Where Things Get Stuck

1. **InviteOptionsGroupId cleared before navigation (Shared tab)**  
   In `shared.tsx`, “Add from Contacts” and “Add manually” do `setInviteOptionsGroupId(null)` then `router.push(\`/group/${inviteOptionsGroupId}?openAdd=...\`)`. Since React state updates are async, `inviteOptionsGroupId` can already be null when the push runs, leading to `/group/undefined?openAdd=contacts`.  
   **Fix:** Capture `inviteOptionsGroupId` in a variable, then clear state, then push with the captured id.

2. **Join screen “Go to Groups”**  
   `join/[token].tsx` uses `router.replace("/(tabs)/groups")` on error. There may be no `groups` tab; the list of groups is on **Shared** tab. Use `"/(tabs)/shared"` instead.

3. **Create invite link response**  
   Backend returns `{ inviteUrl, token, expiresAt }`. Frontend expects `inviteUrl` and `token`. If backend ever returns different keys (e.g. `url` instead of `inviteUrl`), Share/Copy will break.

4. **Deep link not opening app**  
   Ensure `app.json` has `"scheme": "smartbudget"` and that the device/emulator has the app installed and the scheme registered. For web, the invite URL is the **web** URL (e.g. `https://.../join/<token>`), which may need to redirect to the app or show a “Open in app” page.

5. **Group page openAdd effect runs before id is ready**  
   If the route is first rendered with a stale or wrong id, the effect runs with that id. Clearing the query param after opening the modal can avoid re-opening on next focus; current code doesn’t clear `openAdd`, so if user goes back and returns, the modal might open again (acceptable but worth knowing).

6. **Backend 403 on invite link**  
   Only group **admins** (owner or role ADMIN) can create invite links. If a **member** (no ADMIN) taps Plus on Shared tab and then “Share link”, backend returns 403. UI should either hide “Share link” / “Copy link” for non-admins or show a clear error.

7. **addGroupMember body**  
   Backend expects `email` or `name`. For “Add manually” only `name` is sent. For contacts, `name`, `email`, `phone` are sent. Backend creates a placeholder user if email not found, then adds as member.

---

## 11. Types (Quick Reference)

- **GroupRow:** `{ id: string; name: string; createdAt: string; isOwner: boolean }`
- **GroupDashboardResponse:** `group`, `members`, `recent_expenses`, `balances`, `total_group_expenses`, `activity_log`, `isAdmin`, optional `price_records`
- **createGroupInviteLink result:** `{ inviteUrl: string; token: string; expiresAt: string }`
- **joinGroupByToken result:** `{ message: string; groupId: string }`
- **shareReceiptToGroup result:** `{ expenseId: string; alreadyShared?: boolean }`

---

## 12. Checklist for Another LLM / Developer

When debugging “Shared tab” or “invite” or “add person” flows:

1. **Shared tab**
   - Does `getGroups` run on focus and on Retry? Check `load()`, `useFocusEffect`, and `error` state.
   - Does create group call `createGroup` with `name` and `type`? Check backend POST / body.
   - For “Add from Contacts” / “Add manually”: does `router.push` use the **group id** (not null)? Fix by capturing id before `setInviteOptionsGroupId(null)`.

2. **Group page**
   - Does `id` from `useLocalSearchParams` match the URL segment? If you came from Shared with a bug, `id` might be `"undefined"`.
   - Does `openAdd` trigger the right modal? Check the `useEffect` that sets `addPersonContactsVisible` / `addPersonManualVisible`.

3. **Invite link**
   - Does `createGroupInviteLink` get 201 and `{ inviteUrl, token }`? If 403, user is not admin.
   - Is the deep link `smartbudget://join/${token}`? Is the app scheme `smartbudget` in app.json?

4. **Join by link**
   - Does `join/[token].tsx` receive `token` in params? (Depends on how the app handles the deep link.)
   - Does `joinGroupByToken` return `groupId`? After success, does navigation go to `/group/${groupId}`?
   - On error, does “Go to Groups” use `/(tabs)/shared`?

5. **Add member**
   - From group page: does `addGroupMember(safeToken, id, { name })` or `{ name, email, phone }` get 201? Backend requires at least one of email or name.
   - From Shared: after fixing the navigation bug, does the group page open with the correct `id` and `openAdd` so the add-member modal opens?

6. **Library → Split to group**
   - Does `shareReceiptToGroup` get called with correct `receiptId`, `groupId`, and optional `participantIds`? Check `shareReceiptToGroup` in `client.ts` and backend `POST /api/receipts/:id/share-to-group`.

Use this document plus the file paths above to trace from UI → API → backend and back, and to apply the fixes listed in §10.
