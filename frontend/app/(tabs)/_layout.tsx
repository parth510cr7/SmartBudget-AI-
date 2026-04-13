import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { Home, Camera, Users, PieChart, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store/useStore";
import { GlassSurface } from "../../src/components/GlassSurface";
import { getTheme, IOS_BLUE, LIQUID } from "../../src/theme";
import { PillTabBar } from "../../src/components/PillTabBar";

export default function TabLayout() {
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(12, insets.bottom + 8);

  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} isDarkMode={isDarkMode} />}
      screenOptions={{
        tabBarActiveTintColor: IOS_BLUE,
        tabBarInactiveTintColor: textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarActiveBackgroundColor: "rgba(10,132,255,0.14)",
        tabBarInactiveBackgroundColor: "transparent",
        tabBarItemStyle: {
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          marginHorizontal: 4,
          marginVertical: 10,
        },
        tabBarIconStyle: {
          alignSelf: "center",
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <GlassSurface
              isDark={isDarkMode}
              borderRadius={36}
              intensity={isDarkMode ? 50 : 68}
              style={[StyleSheet.absoluteFill, LIQUID.shadow]}
            >
              <View style={{ flex: 1 }} />
            </GlassSurface>
          </View>
        ),
        tabBarStyle: {
          position: "absolute",
          bottom: tabBarBottom,
          left: 24,
          right: 24,
          elevation: 0,
          backgroundColor: "transparent",
          borderRadius: 36,
          height: 72,
          borderTopWidth: 0,
          borderWidth: 0,
        },
        tabBarShowLabel: true,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => <Camera color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="shared"
        options={{
          title: "Shared",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Assistant",
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="receipts"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="stores"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="smartlist"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="groups"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  );
}
