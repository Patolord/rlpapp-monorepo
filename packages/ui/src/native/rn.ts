import type { ComponentProps, ComponentType, ElementType } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";

type WithClassName<C extends ElementType> = ComponentProps<C> & {
  className?: string;
};

/** RN core components with NativeWind `className` (ViewProps is a type alias, so module augmentation does not merge). */
export const View = RNView as unknown as ComponentType<WithClassName<typeof RNView>>;
export const Text = RNText as unknown as ComponentType<WithClassName<typeof RNText>>;
export const Pressable = RNPressable as unknown as ComponentType<
  WithClassName<typeof RNPressable>
>;
