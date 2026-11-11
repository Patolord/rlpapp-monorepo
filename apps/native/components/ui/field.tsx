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

import { colors, control, radius, shadow, space, type } from "@/lib/theme";

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
  /** Os dois têm 48 no design system; mantido por compatibilidade. */
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
  const borderColor = error ? colors.destructive : focused ? colors.focus : colors.controlBorder;
  const height = size === "lg" ? control.heightLg : control.height;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          multiline ? { minHeight: height * 2, alignItems: "flex-start", paddingVertical: 12 } : { height },
          {
            backgroundColor: editable ? colors.surface : colors.controlDisabled,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      >
        {icon ? <View style={[styles.icon, multiline && { paddingTop: 2 }]}>{icon}</View> : null}
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
          editable={editable}
          multiline={multiline}
          style={[
            styles.input,
            { color: editable ? colors.text : colors.controlDisabledText },
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
        <Text style={[type.bodySm, { color: error ? colors.destructive : colors.textSecondary }]}>{error ?? helper}</Text>
      ) : null}
    </View>
  );
}

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
        { borderColor: focused ? colors.focus : colors.controlBorder },
        containerStyle,
      ]}
    >
      <Search size={18} color={colors.icon} strokeWidth={2} />
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
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.searchInput, { color: colors.text }, props.style]}
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
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.text,
  },
  field: {
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    ...shadow.xs,
  },
  icon: {
    width: 28,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    paddingVertical: 0,
  },
  trailing: {
    marginLeft: space.sm,
  },
  search: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    ...shadow.xs,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    paddingVertical: 0,
  },
});
