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
import { X } from "lucide-react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import { useStore } from "../../src/store/useStore";
import { getTheme } from "../../src/theme";
import { authSync, type AuthSyncUser } from "../../src/api/client";
import type { UserState } from "../../src/store/useStore";

const APPLE_BLACK = "#000000";
const GOOGLE_BORDER = "#DADCE0";

/** Web and iOS Client IDs for useIdTokenAuthRequest. Set in app.json extra (googleWebClientId, googleIosClientId) or env EXPO_PUBLIC_GOOGLE_* */
function getGoogleClientIds(): { iosClientId?: string; androidClientId?: string; webClientId?: string } {
  const extra = (typeof globalThis !== "undefined" && (globalThis as any).expo?.constants?.expoConfig?.extra) ?? {};
  return {
    iosClientId: extra.googleIosClientId ?? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: extra.googleAndroidClientId ?? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: extra.googleWebClientId ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
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
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const [loading, setLoading] = useState(false);

  const clientIds = getGoogleClientIds();
  const effectiveGoogleClientId =
    clientIds.webClientId ?? clientIds.iosClientId ?? clientIds.androidClientId ?? "";
  const [, , googlePromptAsync] = useIdTokenAuthRequest({
    ...clientIds,
    clientId: effectiveGoogleClientId || "placeholder-no-google-client-id",
  });

  async function syncWithBackend(idToken: string) {
    setLoading(true);
    try {
      const { user: backendUser } = await authSync(idToken);
      const user = backendUserToStoreUser(backendUser, idToken);
      setUser(user);
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not connect. Please try again.";
      Alert.alert("Sign-in failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAppleSignIn() {
    if (loading) return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const token = credential.identityToken ?? null;
      if (!token) {
        Alert.alert("Sign-in cancelled", "Apple did not return an identity token.");
        return;
      }
      await syncWithBackend(token);
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      setLoading(false);
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
        "Google Sign-In requires a client ID. Add googleIosClientId or googleWebClientId to app.json extra, or set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID."
      );
      return;
    }
    setLoading(true);
    try {
      const result = await googlePromptAsync();
      if (result?.type !== "success") {
        setLoading(false);
        if (result?.type === "dismiss" || result?.type === "cancel") return;
        Alert.alert("Sign-in failed", "Google sign-in was not successful.");
        return;
      }
      const idToken =
        (result.params as { id_token?: string })?.id_token ??
        (result as any).authentication?.idToken ??
        null;
      if (!idToken) {
        setLoading(false);
        Alert.alert("Sign-in failed", "Google did not return an ID token.");
        return;
      }
      await syncWithBackend(idToken);
    } catch (e) {
      setLoading(false);
      const message = e instanceof Error ? e.message : "Google sign-in failed.";
      Alert.alert("Sign-in failed", message);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <TouchableOpacity
        style={[styles.closeBtn, { backgroundColor: glass }]}
        onPress={() => router.back()}
        disabled={loading}
      >
        <X size={24} color={textPrimary} />
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
          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: glass, borderColor: textSecondary }]}
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={[styles.googleBtnText, { color: textPrimary }]}>Sign in with Google</Text>
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
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
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
    backgroundColor: APPLE_BLACK,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  appleBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  googleBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
  },
  googleBtnText: { fontSize: 17, fontWeight: "600" },
  footer: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 32,
    paddingHorizontal: 16,
  },
});
