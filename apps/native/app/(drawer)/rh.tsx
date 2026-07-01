import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Mail, Phone, Search, Users } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";

import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ROLE_LABELS: Record<string, string> = {
  director: "Diretor",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Operador QR",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  rh: "RH",
  engenharia: "Engenharia",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RhScreen() {
  const users = useQuery(api.users.list, { onlyActive: true });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!users) return undefined;
    const term = search.trim().toLowerCase();
    const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return sorted;
    return sorted.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        (u.email?.toLowerCase().includes(term) ?? false) ||
        (u.username?.toLowerCase().includes(term) ?? false)
    );
  }, [users, search]);

  return (
    <Container className="px-5 pt-4 pb-4">
      <View className="gap-5 py-2">
        <View>
          <Text className="text-2xl font-bold text-foreground">
            Recursos Humanos
          </Text>
          <Text className="mt-1 text-muted-foreground">
            Diretório da equipe e contatos.
          </Text>
        </View>

        <View className="flex-row items-center gap-2 rounded-md border border-input bg-card px-3">
          <Search size={16} color="#9ca3af" />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, usuário ou email"
            className="h-12 flex-1 border-0 bg-transparent px-0"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {filtered === undefined ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <Card className="items-center gap-3 py-12">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-violet-500/10">
              <Users size={28} color="#8b5cf6" />
            </View>
            <Text className="text-center text-base font-medium text-foreground">
              {users && users.length === 0
                ? "Nenhum usuário ativo"
                : "Nenhum resultado para a busca"}
            </Text>
          </Card>
        ) : (
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              {filtered.length} pessoa{filtered.length > 1 ? "s" : ""}
            </Text>
            {filtered.map((user) => (
              <Card key={user._id} className="gap-3 p-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-violet-500/15">
                    <Text className="text-sm font-bold text-violet-700">
                      {initials(user.name)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-base font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {user.name}
                    </Text>
                    <View className="mt-1 flex-row flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                      {user.department && (
                        <Badge variant="outline">
                          {DEPARTMENT_LABELS[user.department] ??
                            user.department}
                        </Badge>
                      )}
                    </View>
                  </View>
                </View>

                {(user.phone || user.email) && (
                  <View className="flex-row flex-wrap gap-2 border-t border-border/40 pt-3">
                    {user.phone ? (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(`tel:${user.phone}`)
                        }
                        className="flex-row items-center gap-1.5"
                      >
                        <Phone size={14} color="#737373" />
                        <Text className="text-sm text-muted-foreground">
                          {user.phone}
                        </Text>
                      </Pressable>
                    ) : null}
                    {user.email ? (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(`mailto:${user.email}`)
                        }
                        className="flex-row items-center gap-1.5"
                      >
                        <Mail size={14} color="#737373" />
                        <Text className="text-sm text-muted-foreground">
                          {user.email}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </Card>
            ))}
          </View>
        )}
      </View>
    </Container>
  );
}
