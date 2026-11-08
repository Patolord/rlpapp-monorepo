import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Link2,
  Link2Off,
  QrCode,
  Search,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function QrCodesScreen() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const stats = useQuery(api.qrCodes.stats, {});
  const searchResults = useQuery(
    api.qrCodes.search,
    searchTerm.trim() ? { term: searchTerm.trim() } : "skip"
  );

  const qrCodes = searchResults?.qrCodes ?? [];

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-5 pb-4 pt-5">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full bg-card"
        >
          <ArrowLeft size={20} color="#9ca3af" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">QR Codes</Text>
          <Text className="text-sm text-muted-foreground">
            Gerencie os códigos QR do sistema
          </Text>
        </View>
      </View>

      {stats && (
        <View className="flex-row gap-3 px-5 pb-3">
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Vinculados" value={stats.linked} icon="linked" />
          <StatPill label="Livres" value={stats.free} icon="unlinked" />
        </View>
      )}

      <View className="px-5 pb-3">
        <Input
          placeholder="Buscar por token ou lote..."
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {!searchTerm.trim() ? (
        <View className="flex-1 items-center justify-center px-8">
          <Search size={48} color="#9ca3af" />
          <Text className="mt-4 text-center text-base font-medium text-muted-foreground">
            Busque por token ou lote
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Digite um código QR ou ID de lote para encontrar registros.
          </Text>
        </View>
      ) : searchResults === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={qrCodes}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Card className="items-center gap-3 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <QrCode size={28} color="#f59e0b" />
              </View>
              <Text className="text-center text-base font-medium text-foreground">
                Nenhum QR Code encontrado
              </Text>
              <Text className="px-6 text-center text-sm text-muted-foreground">
                Nenhum resultado para "{searchTerm}".
              </Text>
            </Card>
          }
          renderItem={({ item }) => (
            <QrCodeCard
              token={item.token}
              equipmentName={item.equipment?.description ?? null}
              batchName={item.batchName ?? null}
            />
          )}
        />
      )}
    </View>
  );
}

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: "linked" | "unlinked";
}) {
  return (
    <Card className="min-w-0 flex-1 flex-row items-center gap-1.5 px-3 py-2">
      {icon === "linked" && <Link2 size={14} color="#16a34a" />}
      {icon === "unlinked" && <Link2Off size={14} color="#9ca3af" />}
      <Text className="text-sm font-bold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

function QrCodeCard({
  token,
  equipmentName,
  batchName,
}: {
  token: string;
  equipmentName: string | null;
  batchName: string | null;
}) {
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <QrCode size={20} color="#f59e0b" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className="text-sm font-mono font-semibold text-foreground"
          numberOfLines={1}
        >
          {token}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {equipmentName ?? "Não vinculado"}
          {batchName ? ` · Lote: ${batchName}` : ""}
        </Text>
      </View>
      {equipmentName ? (
        <Link2 size={16} color="#16a34a" />
      ) : (
        <Link2Off size={16} color="#9ca3af" />
      )}
    </Card>
  );
}
