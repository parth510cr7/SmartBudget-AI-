import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { X } from "lucide-react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, LIQUID } from "../../src/theme";
import { authSync, type AuthSyncUser } from "../../src/api/client";
import type { UserState } from "../../src/store/useStore";
import { isFirebaseClientConfigured } from "../../src/auth/firebaseClient";
import {
  exchangeAppleSignInForFirebaseIdToken,
  exchangeGoogleOAuthForFirebaseIdToken,
} from "../../src/auth/exchangeOAuthForFirebaseIdToken";

/** Ignore empty strings so app.json "" does not block EXPO_PUBLIC_* from .env */
function trimStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/** Web / iOS / Android OAuth client IDs: app.json `extra` OR `frontend/.env` EXPO_PUBLIC_GOOGLE_* (restart Expo with -c after edits). */
function getGoogleClientIds(): { iosClientId?: string; androidClientId?: string; webClientId?: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return {
    iosClientId: trimStr(extra.googleIosClientId) ?? trimStr(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    androidClientId:
      trimStr(extra.googleAndroidClientId) ?? trimStr(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
    webClientId: trimStr(extra.googleWebClientId) ?? trimStr(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  };
}

function backendUserToStoreUser(backend: AuthSyncUser, idToken: string): UserState {
  return {
    id: backend.id,
    email: backend.email ?? null,
    name: backend.name ?? null,
    displayName: backend.displayName ?? undefined,
    avatarUrl: backend.avatarUrl ?? undefined,
    firebaseId: backend.firebaseId,
    idToken,
    isGuest: false,
  };
}

export default function LoginModal() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);
  const [loading, setLoading] = useState(false);

  const clientIds = getGoogleClientIds();
  const effectiveGoogleClientId =
    clientIds.webClientId ?? clientIds.iosClientId ?? clientIds.androidClientId ?? "";
  const [, , googlePromptAsync] = useIdTokenAuthRequest({
    ...clientIds,
    clientId: effectiveGoogleClientId || "placeholder-no-google-client-id",
  });

  /** Persists Firebase ID token to backend and closes modal (caller manages `loading`). */
  async function finalizeSignIn(firebaseIdToken: string) {
    try {
      const { user: backendUser } = await authSync(firebaseIdToken);
      const user = backendUserToStoreUser(backendUser, firebaseIdToken);
      setUser(user);
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not connect. Please try again.";
      Alert.alert("Sign-in failed", message);
    }
  }

  async function handleAppleSignIn() {
    if (loading) return;
    if (!isFirebaseClientConfigured()) {
      Alert.alert(
        "Firebase not configured",
        "1) Fill every EXPO_PUBLIC_FIREBASE_* in frontend/.env (not only API key).\n2) npx expo start -c\n3) Firebase Console → Authentication → enable Apple & Google."
      );
      return;
    }
    try {
      const rawNonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: rawNonce,
      });
      const token = credential.identityToken ?? null;
      if (!token) {
        Alert.alert("Sign-in cancelled", "Apple did not return an identity token.");
        return;
      }
      setLoading(true);
      try {
        const firebaseIdToken = await exchangeAppleSignInForFirebaseIdToken(token, rawNonce);
        await finalizeSignIn(firebaseIdToken);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not complete Firebase sign-in.";
        Alert.alert("Sign-in failed", message);
      } finally {
        setLoading(false);
      }
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      const message = e instanceof Error ? e.message : "Apple sign-in failed.";
      Alert.alert("Sign-in failed", message);
    }
  }

  async function handleGoogleSignIn() {
    if (loading) return;
    const clientId = effectiveGoogleClientId;
    if (!clientId || clientId.startsWith("placeholder-")) {
      Alert.alert(
        "Not configured",
        "Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (or EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID on iOS) in frontend/.env from Google Cloud Console → OAuth 2.0 Client IDs. Optionally set extra.googleWebClientId in app.json. Restart: npx expo start -c"
      );
      return;
    }
    if (!isFirebaseClientConfigured()) {
      Alert.alert(
        "Firebase not configured",
        "1) Copy all EXPO_PUBLIC_FIREBASE_* values from Firebase Console → Project settings → Your apps (Web).\n2) Restart: npx expo start -c\n3) Console → Authentication → Sign-in method: enable Google and Apple; add Apple Services ID if needed.\n4) Google Cloud: OAuth client IDs must match EXPO_PUBLIC_GOOGLE_* in .env."
      );
      return;
    }
    setLoading(true);
    try {
      const result = await googlePromptAsync();
      if (result?.type !== "success") {
        if (result?.type === "dismiss" || result?.type === "cancel") return;
        Alert.alert("Sign-in failed", "Google sign-in was not successful.");
        return;
      }
      const params = result.params as { id_token?: string; access_token?: string };
      const idToken =
        params?.id_token ?? (result as { authentication?: { idToken?: string } }).authentication?.idToken ?? null;
      if (!idToken) {
        Alert.alert("Sign-in failed", "Google did not return an ID token.");
        return;
      }
      const accessToken = params?.access_token ?? null;
      const firebaseIdToken = await exchangeGoogleOAuthForFirebaseIdToken(idToken, accessToken);
      await finalizeSignIn(firebaseIdToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google sign-in failed.";
      Alert.alert("Sign-in failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <TouchableOpacity onPress={() => router.back()} disabled={loading} style={styles.closeBtnWrap} activeOpacity={0.85}>
        <GlassSurface isDark={isDarkMode} borderRadius={22} style={[LIQUID.shadow, styles.closeBtn]}>
          <View style={styles.closeBtnInner}>
            <X size={24} color={textPrimary} />
          </View>
        </GlassSurface>
      </TouchableOpacity>
      <Text style={[styles.title, { color: textPrimary }]}>Welcome back</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>
        Sign in to sync your budget across devices
      </Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={textPrimary} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>Signing in…</Text>
        </View>
      ) : (
        <>
          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={styles.appleBtnText}>Sign in with Apple</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleGoogleSignIn} activeOpacity={0.85} disabled={loading}>
            <GlassSurface isDark={isDarkMode} borderRadius={14} style={LIQUID.shadow}>
              <View style={styles.googleBtnInner}>
                <Text style={[styles.googleBtnText, { color: textPrimary }]}>Sign in with Google</Text>
              </View>
            </GlassSurface>
          </TouchableOpacity>
        </>
      )}

      <Text style={[styles.footer, { color: textSecondary }]}>
        By continuing, you agree to our Terms and Privacy Policy.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  closeBtnWrap: {
    position: "absolute",
    top: 48,
    right: 20,
  },
  closeBtn: {
    width: 44,
    height: 44,
  },
  closeBtnInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 28, fontWeight: "800", marginTop: 24 },
  subtitle: { fontSize: 16, marginTop: 8, marginBottom: 40 },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: { marginTop: 16, fontSize: 16 },
  appleBtn: {
    backgroundColor: "#000000",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  appleBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  googleBtnInner: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  googleBtnText: { fontSize: 17, fontWeight: "600" },
  footer: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 32,
    paddingHorizontal: 16,
  },
});
