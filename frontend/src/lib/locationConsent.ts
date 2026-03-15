/**
 * Location consent and privacy for nearby community pricing and basket recommendations.
 * - Consent requested only when needed (finalize basket, nearby community, store recommendations).
 * - Pre-permission in-app modal before OS prompt.
 * - Five explicit states; nearbyCommunityEnabled is a separate feature toggle.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

const KEY_CONSENT = "@SmartBudget/locationConsent";
const KEY_PRECISE = "@SmartBudget/locationUsePrecise";
const KEY_NEARBY_ENABLED = "@SmartBudget/nearbyCommunityEnabled";

export type LocationConsentStatus =
  | "not_asked"
  | "declined_in_app"
  | "os_denied"
  | "granted_precise"
  | "granted_approximate";

export interface LocationConsentState {
  consentStatus: LocationConsentStatus;
  usePreciseLocation: boolean;
  nearbyCommunityEnabled: boolean;
}

const DEFAULT_STATE: LocationConsentState = {
  consentStatus: "not_asked",
  usePreciseLocation: false,
  nearbyCommunityEnabled: true,
};

export async function loadLocationConsent(): Promise<LocationConsentState> {
  try {
    const [consent, precise, enabled] = await Promise.all([
      AsyncStorage.getItem(KEY_CONSENT),
      AsyncStorage.getItem(KEY_PRECISE),
      AsyncStorage.getItem(KEY_NEARBY_ENABLED),
    ]);
    const status = (consent as LocationConsentStatus) ?? DEFAULT_STATE.consentStatus;
    return {
      consentStatus: status,
      usePreciseLocation: precise === "true",
      nearbyCommunityEnabled: enabled !== "false",
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveLocationConsent(state: Partial<LocationConsentState>): Promise<void> {
  try {
    if (state.consentStatus !== undefined)
      await AsyncStorage.setItem(KEY_CONSENT, state.consentStatus);
    if (state.usePreciseLocation !== undefined)
      await AsyncStorage.setItem(KEY_PRECISE, state.usePreciseLocation ? "true" : "false");
    if (state.nearbyCommunityEnabled !== undefined)
      await AsyncStorage.setItem(KEY_NEARBY_ENABLED, state.nearbyCommunityEnabled ? "true" : "false");
  } catch (_) {}
}

/** Revoke: clear to declined_in_app and disable nearby. */
export async function revokeLocationAccess(): Promise<LocationConsentState> {
  const next: LocationConsentState = {
    consentStatus: "declined_in_app",
    usePreciseLocation: false,
    nearbyCommunityEnabled: false,
  };
  await saveLocationConsent(next);
  return next;
}

/** True only when we have valid consented location for API (precise or approximate). */
export function hasConsentedLocation(state: LocationConsentState | null): boolean {
  if (!state) return false;
  return state.consentStatus === "granted_precise" || state.consentStatus === "granted_approximate";
}

export interface LocationResult {
  coords: { lat: number; lng: number } | null;
  osGranted: boolean;
}

/**
 * Request OS location permission and return coords if granted.
 * Call only after in-app consent. Caller should save granted_precise/granted_approximate when coords exist, or os_denied when !osGranted.
 */
export async function getLocationForNearby(usePrecise: boolean): Promise<LocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { coords: null, osGranted: false };
    const accuracy = usePrecise ? Location.Accuracy.High : Location.Accuracy.Balanced;
    const loc = await Location.getCurrentPositionAsync({
      accuracy,
      mayShowUserSettingsDialog: true,
    });
    if (loc?.coords?.latitude != null && loc?.coords?.longitude != null) {
      return { coords: { lat: loc.coords.latitude, lng: loc.coords.longitude }, osGranted: true };
    }
    return { coords: null, osGranted: true };
  } catch {
    return { coords: null, osGranted: false };
  }
}

/** Check current OS permission (no prompt). */
export async function getLocationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "undetermined";
  }
}
