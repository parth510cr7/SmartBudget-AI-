import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LIQUID } from "../theme";

type Props = {
  isDark: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Reserved for a future dev-build blur path; ignored when using the Expo Go–safe panel. */
  intensity?: number;
  borderRadius?: number;
};

const PANEL_GLASS_LIGHT = "rgba(255, 255, 255, 0.72)";
const PANEL_GLASS_DARK = "rgba(44, 44, 46, 0.78)";

/**
 * Frosted “Liquid Glass” surface — translucent panel + rim (no expo-blur).
 * Expo Go does not register `ExpoBlurView`, so using `BlurView` logs native warnings and can
 * fail to render; this path works in Expo Go, dev client, and web.
 */
export function GlassSurface({ isDark, children, style, borderRadius = 20 }: Props) {
  const edge = isDark ? LIQUID.edgeDark : LIQUID.edgeLight;
  const panelBg = isDark ? PANEL_GLASS_DARK : PANEL_GLASS_LIGHT;

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius,
          backgroundColor: panelBg,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: edge,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: "hidden",
    position: "relative",
  },
});
