import { Search, X } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { colors, control, radius, space, type } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Field: text input with the label floating on the border, a leading icon and
// an optional trailing slot (password toggle, unit, clear button...).
// This is the input used on the login screen; every form uses it.
// ---------------------------------------------------------------------------
export type FieldProps = TextInputProps & {
  label: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Error message shown under the field (also turns the border red). */
  error?: string;
  /** Helper text under the field when there is no error. */
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Tall (58) is the login size; "md" (52) suits dense forms. */
  size?: "lg" | "md";
};

export function Field({
  label,
  icon,
  trailing,
  error,
  helper,
  containerStyle,
  size = "lg",
  style,
  onFocus,
  onBlur,
  multiline,
  editable = true,
  ...props
}: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? colors.danger : focused ? colors.focus : colors.border;
  const labelColor = error ? colors.danger : focused ? colors.focus : colors.label;
  const height = size === "lg" ? control.heightLg : control.height;

  return (
    <View style={containerStyle}>
      <View
        style={[
          styles.field,
          multiline ? { minHeight: height * 1.8, alignItems: "flex-start", paddingVertical: 14 } : { height },
          { backgroundColor: editable ? colors.surface : colors.surfaceMuted, borderColor },
        ]}
      >
        <View style={[styles.labelWrap, { backgroundColor: editable ? colors.surface : colors.surfaceMuted }]}>
          <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
        </View>
        {icon ? <View style={[styles.icon, multiline && { paddingTop: 2 }]}>{icon}</View> : null}
        <TextInput
          {...props}
          editable={editable}
          multiline={multiline}
          style={[
            styles.input,
            { color: colors.text, fontSize: size === "lg" ? 18 : 16 },
            multiline && { height: undefined, textAlignVertical: "top" },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error || helper ? (
        <Text style={[type.caption, styles.helper, { color: error ? colors.danger : colors.textSecondary }]}>
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SearchField: pill-shaped search input used at the top of lists.
// ---------------------------------------------------------------------------
export function SearchField({
  value,
  onChangeText,
  placeholder = "Buscar...",
  containerStyle,
  ...props
}: TextInputProps & { value: string; onChangeText: (v: string) => void; containerStyle?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      style={[
        styles.search,
        { borderColor: focused ? colors.focus : colors.border },
        containerStyle,
      ]}
    >
      <Search size={20} color={colors.icon} strokeWidth={1.8} />
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.searchInput, { color: colors.text }]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityLabel="Limpar busca">
          <X size={18} color={colors.icon} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.lg,
    paddingRight: space.lg,
  },
  labelWrap: {
    position: "absolute",
    top: -10,
    left: 14,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
  },
  icon: {
    width: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
  },
  trailing: {
    marginLeft: space.sm,
  },
  helper: {
    marginTop: 6,
    marginLeft: space.lg,
  },
  search: {
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    paddingVertical: 0,
  },
});
