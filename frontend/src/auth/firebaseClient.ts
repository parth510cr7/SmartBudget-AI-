import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  type Auth,
  getAuth,
  initializeAuth,
} from "firebase/auth";

function getReactNativePersistenceSafe() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("firebase/auth") as { getReactNativePersistence?: (s: unknown) => unknown };
    if (typeof mod.getReactNativePersistence === "function") return mod.getReactNativePersistence;
  } catch {
    // ignore
  }
  try {
    // Some Firebase builds expose this under firebase/auth/react-native.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require("firebase/auth/react-native") as { getReactNativePersistence?: (s: unknown) => unknown };
    if (typeof rn.getReactNativePersistence === "function") return rn.getReactNativePersistence;
  } catch {
    // ignore
  }
  return null;
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function readFirebaseOptionsFromEnv(): FirebaseOptions | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim(),
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim(),
  };
}

/** Returns Firebase web config from env, or null if not configured (caller should block sign-in). */
export function getFirebaseOptionsForApp(): FirebaseOptions | null {
  return readFirebaseOptionsFromEnv();
}

/** True when all required Web SDK fields are present (partial .env breaks Google/Apple → Firebase). */
export function isFirebaseClientConfigured(): boolean {
  const o = readFirebaseOptionsFromEnv();
  if (!o?.apiKey) return false;
  const need = [o.authDomain, o.projectId, o.appId, o.messagingSenderId, o.storageBucket] as const;
  return need.every((v) => typeof v === "string" && v.length > 0);
}

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const opts = readFirebaseOptionsFromEnv();
  if (!isFirebaseClientConfigured() || !opts?.apiKey) {
    throw new Error(
      "Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID in .env (see .env.example), then npx expo start -c."
    );
  }
  cachedApp = getApps().length === 0 ? initializeApp(opts) : getApp();
  return cachedApp;
}

function isAlreadyInitializedError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "auth/already-initialized";
}

/**
 * Shared Firebase Auth instance for React Native (AsyncStorage persistence) and web (default getAuth).
 */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (Platform.OS === "web") {
    cachedAuth = getAuth(app);
    return cachedAuth;
  }
  try {
    const getReactNativePersistence = getReactNativePersistenceSafe();
    if (!getReactNativePersistence) {
      throw new Error("Firebase RN persistence helper not available. Check firebase/auth bundling for React Native.");
    }
    cachedAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as any,
    });
  } catch (e: unknown) {
    if (isAlreadyInitializedError(e)) {
      cachedAuth = getAuth(app);
    } else {
      console.warn("[firebaseClient] initializeAuth failed", e instanceof Error ? e.message : e);
      throw e;
    }
  }
  return cachedAuth!;
}
