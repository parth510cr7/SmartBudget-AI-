import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { joinHousehold } from "../../../src/api/client";
import { useStore } from "../../../src/store/useStore";
import { getTheme } from "../../../src/theme";

export default function JoinHouseholdByTokenScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { textPrimary, textSecondary } = getTheme(isDarkMode);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || typeof token !== "string") {
      setStatus("error");
      setMessage("Invalid invite link.");
      return;
    }
    if (!authToken) {
      setStatus("error");
      setMessage("Please sign in to join a household.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await joinHousehold(authToken, token);
        if (cancelled) return;
        setStatus("success");
        setMessage(result.message || "You joined the household.");
        setTimeout(() => {
          router.replace("/household" as const);
        }, 800);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Failed to join household.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, authToken, router]);

  if (status === "loading") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#1C1C1E" : "#F2F2F7" }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.message, { color: textSecondary }]}>Joining household…</Text>
      </SafeAreaView>
    );
  }

  if (status === "error") {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#1C1C1E" : "#F2F2F7" }]}>
        <Text style={[styles.message, { color: textPrimary }]}>{message}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace("/household" as const)}>
          <Text style={styles.buttonText}>Go to Household</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? "#1C1C1E" : "#F2F2F7" }]}>
      <Text style={[styles.message, { color: textPrimary }]}>{message}</Text>
      <ActivityIndicator size="small" color="#007AFF" style={styles.spinner} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
  },
  button: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#007AFF",
    borderRadius: 10,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  spinner: {
    marginTop: 16,
  },
});

