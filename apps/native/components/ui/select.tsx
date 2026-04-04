import { useState } from "react";
import { Modal, Pressable, View, Text, ScrollView, FlatList } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { cn } from "@/lib/utils";

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: SelectOption[];
  className?: string;
}

function Select({ value, onValueChange, placeholder = "Selecione...", options, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        className={cn(
          "h-10 flex-row items-center justify-between rounded-md border border-input bg-card px-3",
          className
        )}
        onPress={() => setOpen(true)}
      >
        <Text
          className={cn(
            "text-sm flex-1",
            selectedOption ? "text-foreground" : "text-muted-foreground"
          )}
          numberOfLines={1}
        >
          {selectedOption?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} className="text-muted-foreground" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-4"
          onPress={() => setOpen(false)}
        >
          <View className="w-full max-w-sm rounded-lg bg-card p-2 shadow-lg max-h-80">
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  className={cn(
                    "flex-row items-center rounded-md px-3 py-2.5",
                    item.value === value && "bg-accent"
                  )}
                  onPress={() => {
                    onValueChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text className="flex-1 text-sm text-foreground">{item.label}</Text>
                  {item.value === value && <Check size={16} className="text-primary" />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export { Select, type SelectOption };
