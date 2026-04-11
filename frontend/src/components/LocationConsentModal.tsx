/**
 * In-app pre-permission message for location.
 * Shown before the OS permission prompt when we need location for nearby community pricing.
 * Explains why, what they get, privacy (exact location not shared, anonymous aggregates), and that they can turn off later.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { MapPin } from "lucide-react-native";
import { GlassSurface } from "./GlassSurface";
import { getTheme, IOS_BLUE, LIQUID } from "../theme";

export type LocationConsentChoice = "precise" | "approximate" | "not_now";

interface LocationConsentModalProps {
  visible: boolean;
  onChoose: (choice: LocationConsentChoice) => void;
  isDarkMode?: boolean;
}

const COPY = {
  title: "Enable location for nearby prices",
  why: "Location is used to compare your basket with nearby community prices within 30 km, improve store-specific basket recommendations, and to identify when splitting shopping across 2 stores might save you money.",
  benefit: "You get more relevant nearby price comparisons, better local basket optimization, and an optional recommendation to split across 2 stores when savings are meaningful.",
  privacy: "Your exact home address is never shared with other users. Community results are anonymous and aggregated. Location is used only for nearby pricing and recommendation features.",
  later: "You can turn this off anytime in Profile → Privacy & Location.",
  btnPrecise: "Allow precise location",
  btnApproximate: "Allow approximate location",
  btnNotNow: "Not now",
};

export function LocationConsentModal({
  visible,
  onChoose,
  isDarkMode = false,
}: LocationConsentModalProps) {
  const { bg, textPrimary, textSecondary } = getTheme(isDarkMode);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onChoose("not_now")}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => onChoose("not_now")}
      >
        <View onStartShouldSetResponder={() => true}>
          <GlassSurface isDark={isDarkMode} borderRadius={20} style={[LIQUID.shadow, styles.card]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconWrap}>
              <MapPin size={40} color={IOS_BLUE} />
            </View>
            <Text style={[styles.title, { color: textPrimary }]}>{COPY.title}</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>{COPY.why}</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>{COPY.benefit}</Text>
            <Text style={[styles.paragraph, { color: textSecondary }]}>{COPY.privacy}</Text>
            <Text style={[styles.small, { color: textSecondary }]}>{COPY.later}</Text>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: IOS_BLUE }]}
              onPress={() => onChoose("precise")}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>{COPY.btnPrecise}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSecondary, { backgroundColor: bg }]}
              onPress={() => onChoose("approximate")}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnSecondaryText, { color: textPrimary }]}>{COPY.btnApproximate}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={() => onChoose("not_now")}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnGhostText, { color: textSecondary }]}>{COPY.btnNotNow}</Text>
            </TouchableOpacity>
          </ScrollView>
          </GlassSurface>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    overflow: "hidden",
    maxHeight: "85%",
  },
  scroll: { maxHeight: 480 },
  scrollContent: { padding: 24, paddingBottom: 32 },
  iconWrap: { alignItems: "center", marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 24,
    fontStyle: "italic",
  },
  btnPrimary: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  btnPrimaryText: { color: "#FFF", fontSize: 17, fontWeight: "600" },
  btnSecondary: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  btnSecondaryText: { fontSize: 17, fontWeight: "600" },
  btnGhost: {
    paddingVertical: 14,
    alignItems: "center",
  },
  btnGhostText: { fontSize: 16 },
});
