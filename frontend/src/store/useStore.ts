import { create } from "zustand";
import type { LocationConsentState } from "../lib/locationConsent";
import type { OverpaidInsightPayload } from "../api/client";

export type ThemeMode = "light" | "dark" | "system";

/** Minimal type for transaction list shared across tabs (store + items for Search/Insights). */
export type TransactionRow = { id: string; store?: { name?: string; address?: string | null }; items?: unknown[]; [k: string]: unknown };

export interface UserState {
  id: string | null;
  email: string | null;
  name: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  firebaseId: string | null;
  idToken?: string | null;
  isGuest?: boolean;
}

interface AppStore {
  user: UserState | null;
  theme: ThemeMode;
  isDarkMode: boolean;
  refreshKey: number;
  setUser: (user: UserState | null) => void;
  setTheme: (theme: ThemeMode) => void;
  setDarkMode: (value: boolean) => void;
  updateProfile: (displayName?: string | null, avatarUrl?: string | null) => void;
  triggerDashboardRefresh: () => void;
  /** Shared transaction list so Home/Receipts/Search stay in sync. */
  transactions: TransactionRow[];
  setTransactions: (data: TransactionRow[]) => void;
  /** Persistent shopping list (basket). Cleared when Reset runs. */
  basket: string[];
  setBasket: (next: string[] | ((prev: string[]) => string[])) => void;
  /** Pre-fill for Add Expense from receipt OCR (merchant + total). needsReview when total confidence was low. */
  expensePrefill: { description: string; amount: number; needsReview?: boolean } | null;
  setExpensePrefill: (value: { description: string; amount: number; needsReview?: boolean } | null) => void;
  /** Location consent for nearby community pricing. Load from AsyncStorage when needed. */
  locationConsent: LocationConsentState | null;
  setLocationConsent: (state: LocationConsentState | null) => void;
  /** Latest scan insight (Home banner); cleared when dismissed. */
  lastReceiptInsight: OverpaidInsightPayload | null;
  setLastReceiptInsight: (value: OverpaidInsightPayload | null) => void;
}

export const useStore = create<AppStore>((set) => ({
  user: null,
  theme: "system",
  isDarkMode: false,
  refreshKey: 0,
  transactions: [],
  setTransactions: (data) => set({ transactions: Array.isArray(data) ? data : [] }),
  basket: [],
  setBasket: (next) => set((s) => ({ basket: typeof next === "function" ? next(s.basket ?? []) : next })),
  expensePrefill: null,
  setExpensePrefill: (value) => set({ expensePrefill: value }),
  locationConsent: null,
  setLocationConsent: (state) => set({ locationConsent: state }),
  lastReceiptInsight: null,
  setLastReceiptInsight: (value) => set({ lastReceiptInsight: value }),
  setUser: (user) => set({ user }),
  setTheme: (theme) => set({ theme }),
  setDarkMode: (value) => set({ isDarkMode: value, theme: value ? "dark" : "light" }),
  updateProfile: (displayName, avatarUrl) =>
    set((s) => ({
      user: s.user
        ? { ...s.user, ...(displayName !== undefined && { displayName }), ...(avatarUrl !== undefined && { avatarUrl }) }
        : s.user,
    })),
  triggerDashboardRefresh: () => set((s) => ({ refreshKey: (s.refreshKey ?? 0) + 1 })),
}));
