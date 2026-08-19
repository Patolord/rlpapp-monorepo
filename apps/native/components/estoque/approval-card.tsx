import { Text, View } from "react-native";
import { Check, X } from "lucide-react-native";

import { formatDateTime } from "@rlpapp/shared";
import { Button, ButtonText } from "@/components/ui/button";

interface ApprovalCardProps {
  materialName: string;
  quantity: number;
  unit?: string;
  requesterName: string;
  createdAt: number;
  onApprove: () => void;
  onReject: () => void;
  isLoading?: boolean;
}

export function ApprovalCard({
  materialName,
  quantity,
  unit,
  requesterName,
  createdAt,
  onApprove,
  onReject,
  isLoading,
}: ApprovalCardProps) {
  return (
    <View className="rounded-lg border border-border bg-card p-4">
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1">
          <Text className="text-foreground font-medium text-sm">{materialName}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">
            Quantidade: {quantity} {unit}
          </Text>
        </View>
        <Text className="text-muted-foreground text-xs">
          {formatDateTime(createdAt)}
        </Text>
      </View>

      <Text className="text-muted-foreground text-xs mb-3">
        Solicitado por: {requesterName}
      </Text>

      <View className="flex-row gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onPress={onReject}
          disabled={isLoading}
        >
          <View className="flex-row items-center gap-1.5">
            <X size={14} color="#dc2626" />
            <ButtonText variant="outline">Rejeitar</ButtonText>
          </View>
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onPress={onApprove}
          disabled={isLoading}
        >
          <View className="flex-row items-center gap-1.5">
            <Check size={14} color="#fff" />
            <ButtonText>Aprovar</ButtonText>
          </View>
        </Button>
      </View>
    </View>
  );
}
