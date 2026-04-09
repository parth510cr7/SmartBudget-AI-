import "../global.css";
import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { useStore } from "../src/store/useStore";
import { useMemo } from "react";
import { View } from "react-native";

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const theme = useStore((s) => s.theme);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const systemScheme = useColorScheme();
  const resolved = useMemo(() => {
    if (isDarkMode) return "dark";
    if (theme === "system") return systemScheme ?? "light";
    return theme;
  }, [theme, systemScheme, isDarkMode]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: resolved === "dark" ? "#1C1C1E" : "#F2F2F7",
      }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeWrapper>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="modal/scanner" options={{ presentation: "modal" }} />
        <Stack.Screen name="modal/login" options={{ presentation: "modal" }} />
        <Stack.Screen name="modal/library" options={{ presentation: "modal" }} />
        <Stack.Screen name="modal/price-history-sharing" options={{ presentation: "modal", title: "Price history sharing" }} />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="join/[token]" />
        <Stack.Screen name="household" />
        <Stack.Screen name="household/join/[token]" />
      </Stack>
    </ThemeWrapper>
  );
}
