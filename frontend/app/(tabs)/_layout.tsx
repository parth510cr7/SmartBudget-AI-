import { View } from "react-native";
import { Tabs } from "expo-router";
import { Home, Search, Camera, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";

export default function TabLayout() {
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(12, insets.bottom + 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: IOS_BLUE,
        tabBarInactiveTintColor: textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarActiveBackgroundColor: "rgba(10,132,255,0.12)",
        tabBarInactiveBackgroundColor: "transparent",
        tabBarItemStyle: {
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          marginHorizontal: 8,
          marginVertical: 10,
        },
        tabBarIconStyle: {
          alignSelf: "center",
        },
        tabBarStyle: {
          position: "absolute",
          bottom: tabBarBottom,
          left: 24,
          right: 24,
          elevation: 0,
          backgroundColor: glass,
          borderRadius: 36,
          height: 72,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.5)",
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
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
          headerShown: false,
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
