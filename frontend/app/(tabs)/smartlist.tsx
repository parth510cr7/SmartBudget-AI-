import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import {
  ShoppingCart,
  Home,
  Shield,
  Tv,
  Smartphone,
  CreditCard,
  Plus,
} from "lucide-react-native";

const CATEGORIES = [
  {
    title: "Grocery List",
    items: [
      { label: "Produce", icon: ShoppingCart },
      { label: "Dairy", icon: ShoppingCart },
      { label: "Pantry", icon: ShoppingCart },
    ],
  },
  {
    title: "Household (EMI/Ins)",
    items: [
      { label: "EMI", icon: Home },
      { label: "Insurance", icon: Shield },
    ],
  },
  {
    title: "Subscriptions (Netflix/Recharge)",
    items: [
      { label: "Netflix", icon: Tv },
      { label: "Recharge", icon: Smartphone },
    ],
  },
  {
    title: "Extra Costs",
    items: [
      { label: "Dining out", icon: CreditCard },
      { label: "Fuel", icon: CreditCard },
      { label: "Misc", icon: CreditCard },
    ],
  },
];

export default function SmartListScreen() {
  const [manualCategories, setManualCategories] = useState<string[]>([]);

  function addManualChoice() {
    setManualCategories((prev) => [...prev, `Custom ${prev.length + 1}`]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Smart List</Text>
      <Text style={styles.subtitle}>Categories</Text>

      {CATEGORIES.map((cat) => (
        <View key={cat.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{cat.title}</Text>
          <View style={styles.chipRow}>
            {cat.items.map((item) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity key={item.label} style={styles.chip}>
                  <Icon size={18} color="#4F46E5" />
                  <Text style={styles.chipText}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {manualCategories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual</Text>
          <View style={styles.chipRow}>
            {manualCategories.map((label) => (
              <TouchableOpacity key={label} style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.manualBtn} onPress={addManualChoice}>
        <Plus size={22} color="#4F46E5" />
        <Text style={styles.manualBtnText}>Manual Choice</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6B7280", marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4F46E5",
    borderStyle: "dashed",
    marginTop: 8,
  },
  manualBtnText: { fontSize: 16, fontWeight: "600", color: "#4F46E5" },
});
