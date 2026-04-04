import { Modal, Pressable, View, Text, ScrollView } from "react-native";
import { cn } from "@/lib/utils";
import { X } from "lucide-react-native";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-4"
        onPress={() => onOpenChange(false)}
      >
        <Pressable
          className="w-full max-w-lg rounded-lg bg-card p-6 shadow-lg"
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("mb-4", className)}>
      {children}
    </View>
  );
}

function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </Text>
  );
}

function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Text className={cn("text-sm text-muted-foreground mt-1", className)}>
      {children}
    </Text>
  );
}

function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("", className)}>
      {children}
    </View>
  );
}

function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <View className={cn("flex-row justify-end gap-2 mt-4", className)}>
      {children}
    </View>
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter };
