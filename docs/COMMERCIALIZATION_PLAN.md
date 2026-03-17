# SmartBudget AI — Commercialization Plan

**Purpose:** A detailed, actionable plan to take SmartBudget AI from product to a commercial, on-device-first app: positioning, monetization, distribution, compliance, roadmap, and metrics.

---

## 1. Product positioning & value proposition

### 1.1 One-liner

**“Your receipts and spending intelligence, private and on your device.”**

### 1.2 Core differentiators

| Differentiator | What it means | Why it sells |
|----------------|---------------|--------------|
| **On-device AI** | Receipt parsing (Phi 3.5 mini, optional bigger model), categorization, and chat run on the phone. No receipt images or line items sent to the cloud for AI. | Privacy-first story; no “we upload your receipts to our servers.” Strong for EU/health-conscious users. |
| **Your data, your control** | Receipts, stores, basket history, and (optional) sync stay under user control. Cloud is for auth, optional sync, and group/community—not for training models on your data. | Trust; easier compliance storytelling (GDPR, health data). |
| **Receipt → basket → best store** | Scan receipts → build price history → add items to basket → get “best store” and estimated total from *your* history (and optionally nearby community). | Clear daily utility: “Where should I shop for this list?” |
| **Groups + splits + medical** | One app: personal budget, group expenses (Splitwise-like), and medical/vault. Optional link from receipt to medical folder. | Stickiness; family/roommate and health use cases. |

### 1.3 Target segments (who pays)

| Segment | Description | Primary use case | Willingness to pay |
|---------|-------------|------------------|--------------------|
| **Solo savers** | Individuals tracking spend and optimizing grocery runs. | Receipt scan, categories, basket → best store. | Low–medium (freemium; pay for limits or power features). |
| **Households / roommates** | 2–5 people sharing expenses and sometimes shopping lists. | Groups, splits, shared basket or store tips. | Medium (premium groups, extra members, history). |
| **Health-conscious / chronic** | People tracking prescriptions, medical visits, FSA/HSA. | Medical vault, receipt → Rx (future), export for taxes. | Medium–high (privacy + utility). |
| **Privacy-first / EU** | Users who avoid cloud AI and want minimal data sharing. | Full on-device pipeline, optional sync, clear data policy. | High (premium for “no cloud” or export). |
| **Power users** | Heavy receipt volume, many stores, want best accuracy. | Bigger on-device model, unlimited receipts, multi-store optimization. | High (premium tier). |

### 1.4 Anti-positioning (what we are *not*)

- **Not** a bank or card aggregator (we don’t replace Open Banking / Plaid).
- **Not** a generic “AI chatbot” — we’re a receipt and spending assistant with optional chat over *your* data.
- **Not** “free by selling your data” — monetization is subscriptions and optional services, not selling receipt or PII data.

---

## 2. Business model

### 2.1 Philosophy

- **Full free access first** for 2–3 months so users get used to the app and we build enough data for community; then **choose**: paid plan (full features) or free plan (scan + category only).
- **No ads on receipt or financial data** (preserves trust).
- **Affordable pricing** — budgeting is already expensive; keep subscription low so it’s an easy yes.
- **Transparent** — no surprise charges; clear what’s free after trial and what requires Premium.

### 2.2 Trial then two plans (detailed)

**Phase 1 — New user: full free access for 2–3 months**

- Every new user gets **full access** for **2 or 3 months** (exact length TBD: 2 vs 3).
- Goals:
  - User builds habit (scan, basket, Finalize, groups, medical if they use it).
  - App collects enough receipt/history data so **basket → best store** and **community** are actually useful when we ask them to choose a plan.
- No paywall during this period; all features unlocked.

**Phase 2 — After trial: choose Free or Paid**

| Feature | Free (after trial) | Premium (paid) |
|---------|--------------------|----------------|
| **Receipt scans** | Yes | Yes |
| **See category & Home** | Yes (scan and see category breakdown) | Yes |
| **Library & search** | Yes | Yes |
| **Basket → best store (Finalize)** | No | Yes |
| **Groups / splits** | No | Yes |
| **Medical vault** | No | Yes |
| **Export / backup** | No | Yes |
| **Community pricing** | No (or view only) | Yes (contribute + 30km insights) |
| **Bigger on-device model** | No (Phi 3.5 mini only) | Yes (“Faster vs more accurate” toggle) |
| **Support** | In-app FAQ / email | Priority email |
| **Price** | $0 | **$4.99/month** or **$39.99/year** |

- **Free after trial** = “just scan and see category” — enough to stay in the app and track spend, but no basket intelligence, no groups, no medical, no export.
- **Premium** = everything; pricing kept low: **$4.99/month**, **$39.99/year** (annual ≈ 2 months free).

### 2.3 Alternative / add-on revenue (later)

- **One-time “Pro” unlock** (optional later) for users who prefer a single payment over subscription.
- **Family plan** (optional later) — e.g. 2–5 accounts under one subscription.
- **B2B / white-label** — separate licensing if pursued.

### 2.4 Rationale for limits and upgrade prompts

- **Trial length (2–3 months):** Long enough to form habit and for the app to have useful history/community data; then one clear moment: “Your trial is ending. Choose Free (scan + category) or Premium (full features).”
- **Free after trial:** Scan + category keeps the app useful for light users and keeps them in the ecosystem; limits (no Finalize, no groups, no medical) create a clear reason to upgrade when they want basket recommendations or shared expenses.
- **Upgrade prompts:** When a post-trial Free user taps Finalize, Groups, or Medical: “This is a Premium feature. Upgrade to get best store recommendations / split expenses / medical vault.” One CTA, not aggressive.
- **Pricing:** $39.99/year and $4.99/month kept low so budgeting-conscious users don’t feel the app is another big expense.

---

## 3. Distribution & launch strategy

### 3.1 Technical prerequisites for “real” launch

- **On-device LLM** requires a **development build** (not Expo Go): `npx expo run:ios` / `run:android` or EAS Build.
- **Model download is required for full functionality** — without it, receipt parsing and core value don’t work. **Phi 3.5 mini** (~1.4 GB): document clearly in app and store listing; **min device specs** (OS version, free storage) must be stated so users know before install. Optional “bigger model” later for Premium.
- **Backend** for auth, sync, groups, community: already in place; ensure scalability (e.g. connection pooling, rate limits) before broad launch.
- **Store compliance:** Apple App Store and Google Play policies (data use, in-app purchase if selling digital goods, subscription disclosure).

### 3.2 Phased rollout

| Phase | Audience | Goal | Duration (example) |
|-------|----------|------|---------------------|
| **Alpha** | You + 5–10 testers | Stability, on-device flow, no crashes on mid-range devices | 2–4 weeks |
| **Closed beta** | TestFlight (iOS) + internal (Android) | Real receipt volume, battery/storage feedback, paywall UX | 4–8 weeks |
| **Open beta / soft launch** | One region (e.g. US or Canada) or invite-only | Conversion (free → premium), support load, server cost | 4–12 weeks |
| **General availability** | Store listing public; optional geo expansion | Scale acquisition; iterate on pricing and retention | Ongoing |

### 3.3 Store listing & ASO (App Store Optimization)

- **Title:** e.g. “SmartBudget AI – Receipts & Spending”
- **Subtitle / short description:** Lead with privacy and utility: “Scan receipts on-device. Get spending insights and best store for your basket. Private.”
- **Keywords:** receipt scanner, budget, spending tracker, on-device AI, grocery list, split expenses, medical receipts, privacy.
- **Screenshots:** Receipt scan → Library; Basket → Finalize (best store); Home (categories); Groups/Splits; Medical vault (if public).
- **Privacy label / Data safety:** Accurate list: e.g. account data, purchase history (your own), optional location for community; “Data not shared with third parties for advertising”; “Data used for app functionality.”

### 3.4 Acquisition (post-launch)

- **Organic:** ASO, word of mouth, “privacy-first receipt app” comparisons.
- **Content:** Short how-to (receipt → basket → best store), blog/YouTube on “on-device AI.”
- **Paid (later):** Apple Search Ads / Google UAC, small budgets; track install → sign-up → receipt scan → premium.

---

## 4. Compliance & legal

### 4.1 Privacy

- **Privacy Policy:** Must state clearly:
  - What data is collected (account, receipts if synced, group data, optional location).
  - That receipt parsing can be **fully on-device** (no receipt images to your servers for AI).
  - How long data is kept; user rights (access, delete, export).
  - If you use Firebase/Google for auth: that you use Google for sign-in only; link to Google’s policy.
- **In-app:** Short “Privacy” summary (e.g. on first launch or in Profile) with link to full policy.
- **Consent:** Location for “community within 30km” must be opt-in and explain why; same for any analytics if added.

### 4.2 Terms of Service

- Acceptable use; no abuse of groups or community features.
- Subscription terms: renewal, cancel, refund (follow store rules).
- Disclaimer: “Not financial advice”; “Estimates only.”
- Jurisdiction and dispute resolution.

### 4.3 Data handling (on-device vs cloud)

| Data | Where it lives | Commercial message |
|------|----------------|--------------------|
| Receipt image | Device only (on-device parsing) or, if user enables sync, your backend for storage only (not for AI). | “We don’t use your receipts to train AI.” |
| Parsed items, totals, stores | Device; optionally synced for backup/groups. | “You choose what syncs.” |
| Basket, Finalize runs | Device; API calls for best-store logic (item names, no raw image). | “We only need your list to recommend; we don’t store it for ads.” |
| Group / community | Backend (needed for splits and community aggregates). | “Encrypted; used only for your groups and local price insights.” |
| Medical | Device-first or encrypted backend if synced. | “Sensitive data; we never use it for marketing.” |

### 4.4 Health / medical (if you promote medical vault)

- Avoid “medical advice” or “diagnosis”; position as “organize and track medical receipts and expenses.”
- If you ever do Rx detection from receipts: clarify “for your records only”; consider extra consent and secure storage.
- FSA/HSA export: “For your records; confirm with your plan.”

### 4.5 Regional notes

- **EU (GDPR):** Right to access, erase, port; lawful basis (contract, consent); data processor agreements if you use vendors (e.g. Firebase, hosting).
- **California (CCPA):** Similar transparency; “Do not sell” (you don’t sell receipt data; state it clearly).
- **Store rules:** Apple and Google require clear subscription terms and privacy; follow their latest guidelines.

---

## 5. Product roadmap (commercial lens)

### 5.1 Pre-launch (must-have for trial + paid)

- **Trial:** 2–3 months full access for every new user; no paywall during trial.
- **Paywall at trial end:** One clear moment: “Your trial is ending. Continue with Free (scan + category only) or Premium (full features) for $4.99/mo or $39.99/yr.” Clear upgrade CTA and restore.
- **Post-trial Free:** When a Free user taps Finalize, Groups, or Medical, show: “Premium feature — upgrade to unlock.”
- **Subscription:** StoreKit 2 / Google Play Billing; server-side receipt validation to gate API by tier (Premium vs Free).
- **Onboarding:** Short flow: “Scan a receipt → see it in Library → add items → Finalize” so value is clear in first session.
- **Model download:** Required for full functionality; reliable Phi 3.5 mini download and “Load model”; clear storage requirement (~1.4 GB) and min specs.

### 5.2 Bigger on-device model (quality vs speed) — Premium

- Second, larger model (e.g. Phi 4 or similar when available) as **in-app download for Premium** (e.g. +1–2 GB).
- **Toggle:** “Faster (Phi 3.5 mini)” vs “More accurate (bigger model)” — Premium only.
- **Monetization:** Bigger model is **Premium-only** to justify development and support cost; no one-time Pro for this feature in the base plan (one-time Pro / family plan remain optional later).

### 5.3 Retention and engagement

- **Reminders:** Optional “Scan your receipts” or “Review your week” (respect user preference and OS limits).
- **Weekly/monthly summary:** “You saved $X by shopping at [store]” or “Your top category this month.”
- **Group nudges:** “You have an unpaid balance in [group].”

### 5.4 Roadmap table (high level)

| When | What |
|------|------|
| **Now** | Stable on-device parsing; no Gemini; limits and paywall design. |
| **Launch** | Free + Premium (subscription); TestFlight → store. |
| **+1–2 months** | 30km community filter; clearer “why no recommendation”; export for Premium. |
| **+3–6 months** | Bigger on-device model (Premium); receipt → medical (Rx detection) as opt-in; family plan (optional). |
| **+6–12 months** | B2B/white-label exploration; more regions/locales. |

---

## 6. Metrics & success criteria

### 6.1 North Star

- **Weekly active users who scanned at least one receipt** (or used basket Finalize with their history). Ties directly to core value.

### 6.2 Funnel

| Stage | Metric | Target (example) |
|-------|--------|-------------------|
| Install | Installs (organic + paid) | Track by source |
| Activate | Sign-up (Apple/Google) | e.g. >40% of installs |
| First value | First receipt scanned or first Finalize | e.g. >50% of sign-ups within 7 days |
| Habit | Receipts scanned in 2nd week | e.g. >30% of actives |
| Trial | Users still active in month 2–3 (full access) | Enough data for community + habit |
| Trial end | Choose Free vs Premium at end of 2–3 months | Conversion to Premium from this cohort (e.g. >20–30%) |
| Retain (Premium) | Month-2 retention (paying) | e.g. >70% |
| Retain (Free) | Post-trial Free users who keep scanning | Track; some may upgrade later when they hit Premium feature |

### 6.3 Business health

- **MRR/ARR** from subscriptions.
- **LTV** (lifetime value) and **CAC** (customer acquisition cost) once you have paid acquisition.
- **Support:** Tickets per 1000 DAU; time to first reply (for Premium if you promise priority).
- **Infra:** Cost per DAU (backend, storage, bandwidth); keep unit economics positive at target price.

### 6.4 Product quality

- **Crash-free rate** (e.g. >99.5%).
- **On-device model:** Load success rate; parse success (e.g. % of scans that yield at least store + total).
- **Basket:** % of Finalize runs that return a best store (when user has enough history).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **On-device model required** — app not fully functional without it (storage, battery, low-end devices) | **Require** model download for core receipt parsing; state **min specs** clearly (OS, free storage ~1.5 GB+) in app and store listing; graceful message if device can’t run it (“Scan not available on this device — need X GB free and iOS/Android Y”). Bigger model is optional Premium download. |
| **Low conversion trial → paid** | 2–3 months full access so value is clear; at trial end, one clear choice (Free vs Premium) with concrete copy (“Keep full features for $4.99/mo or $39.99/yr”); A/B test paywall and timing. |
| **Store rejection** (policy, privacy, or IAP) | Clear privacy label; subscription terms and restore; no misleading “free”; test with TestFlight/Internal Testing first. |
| **Backend cost at scale** | Rate limits; cache basket/insights; monitor cost per user; Premium gets full API access, Free (post-trial) limited. |
| **Regulation (health/finance)** | No “advice”; medical = organization only; receipt data usage transparent and on-device-first. |
| **Competition** | Emphasize privacy and on-device; own “receipt + basket → best store” and “groups + medical in one app.” |

---

## 8. Summary checklist (commercialization)

- [ ] **Positioning:** On-device, private, receipt → basket → best store; document in one-pager and store listing.
- [ ] **Tiers:** 2–3 months full free trial → then Free (scan + category only) or Premium ($4.99/mo, $39.99/yr); paywall and subscription implemented; upgrade prompts at trial end and when Free user hits Premium features.
- [ ] **Build:** Dev build; **model download required** for full functionality; min specs documented; Phi 3.5 mini default, bigger model Premium later; no dependency on Google Gemini.
- [ ] **Legal:** Privacy Policy and Terms live; in-app summary and consent for location/community; store-compliant IAP.
- [ ] **Launch:** Alpha → Closed beta (TestFlight) → Soft launch (one region) → GA; ASO and screenshots ready.
- [ ] **Metrics:** North Star (e.g. WAUs with receipt/Finalize); funnel (install → trial → trial end → Free vs Premium → retain); retention and cost monitored.
- [ ] **Roadmap:** 30km community, export, bigger model (Premium), receipt→medical, optional family plan / one-time Pro later.

Use this document as the single reference for commercialization: update tiers and dates as you validate with real users and store feedback.
