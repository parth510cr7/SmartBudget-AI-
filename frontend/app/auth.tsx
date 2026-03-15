import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Mail, Lock, LogIn } from "lucide-react-native";
import { useStore } from "../src/store/useStore";
import type { UserState } from "../src/store/useStore";

const GUEST_USER: UserState = {
  id: "guest",
  email: null,
  name: "Guest",
  firebaseId: null,
  idToken: null,
  isGuest: true,
};

export default function AuthScreen() {
  const router = useRouter();
  const setUser = useStore((s) => s.setUser);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSkipForNow() {
    setUser(GUEST_USER);
    router.replace("/(tabs)");
  }

  function handleGoogleLogin() {
    router.push("/modal/login");
  }

  function handleEmailSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert("Required", "Please enter your email.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Required", "Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setUser({
        id: `user-${trimmedEmail}`,
        email: trimmedEmail,
        name: trimmedEmail.split("@")[0] ?? "User",
        firebaseId: `firebase-${trimmedEmail}`,
        idToken: "mock-email-id-token",
        isGuest: false,
      });
      setLoading(false);
      router.replace("/(tabs)");
    }, 600);
  }

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>SmartBudget AI</Text>
        <Text style={styles.subtitle}>
          {isLogin ? "Sign in to continue" : "Create an account"}
        </Text>

        <View style={styles.authCard}>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, isLogin && styles.toggleBtnActive]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>
                Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, !isLogin && styles.toggleBtnActive]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>
                Sign up
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleLogin}
            disabled={loading}
          >
            <Text style={styles.googleBtnText}>Login with Google</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.field}>
            <Mail size={20} color="#6B7280" style={styles.fieldIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>
          <View style={styles.field}>
            <Lock size={20} color="#6B7280" style={styles.fieldIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password (min 6 characters)"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              editable={!loading}
            />
          </View>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleEmailSubmit}
            disabled={loading}
          >
            <LogIn size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>
              {isLogin ? "Login" : "Create account"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkipForNow}
          disabled={loading}
        >
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.skipHint}>
          Use as guest. You can sign in later from Profile.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 32,
    textAlign: "center",
  },
  authCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  toggleRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  toggleBtnActive: {
    backgroundColor: "#4F46E5",
  },
  toggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  toggleTextActive: {
    color: "#FFFFFF",
  },
  googleBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#9CA3AF",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fieldIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4F46E5",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  skipBtn: {
    paddingVertical: 16,
    alignItems: "center",
  },
  skipBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  skipHint: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 4,
  },
});
