/**
 * Adds the NativeWind `className` prop to React Native core components so the
 * package type-checks standalone. The consuming native app provides the same
 * augmentation at runtime via NativeWind.
 */
import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
}
