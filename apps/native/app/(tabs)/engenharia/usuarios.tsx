import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";
import { getErrorMessage } from "@/lib/errors";

type User = FunctionReturnType<typeof api.users.list>[number];
type UserRole =
  | "director"
  | "admin"
  | "manager"
  | "operator"
  | "engenheiro"
  | "qr_operator";
type Department = "rh" | "engenharia";

const ROLE_LABELS: Record<string, string> = {
  director: "Diretor",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Operador QR",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  rh: "Recursos Humanos",
  engenharia: "Engenharia",
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const DEPARTMENT_OPTIONS = Object.entries(DEPARTMENT_LABELS).map(
  ([value, label]) => ({ value, label })
);
const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

export default function UsuariosScreen() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.list, {});
  const createUser = useAction(api.userAdmin.adminCreateUser);
  const updateUser = useMutation(api.users.update);
  const removeUser = useMutation(api.users.remove);
  const reactivateUser = useMutation(api.users.reactivate);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emptyCreate = {
    firstName: "",
    lastName: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    role: "",
    department: "",
  };
  const [createForm, setCreateForm] = useState({ ...emptyCreate });
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    department: "",
  });

  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];
    if (filterStatus === "active") result = result.filter((u) => u.isActive);
    else if (filterStatus === "inactive")
      result = result.filter((u) => !u.isActive);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.username?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [users, filterStatus, searchTerm]);

  async function handleCreate() {
    if (!createForm.firstName.trim()) return Alert.alert("Informe o nome");
    if (!createForm.lastName.trim()) return Alert.alert("Informe o sobrenome");
    if (!createForm.username.trim()) return Alert.alert("Informe o username");
    if (createForm.password.length < 8)
      return Alert.alert("A senha deve ter pelo menos 8 caracteres");
    if (!createForm.role) return Alert.alert("Selecione o cargo");

    setIsSubmitting(true);
    try {
      const fullName = `${createForm.firstName.trim()} ${createForm.lastName.trim()}`;
      await createUser({
        name: fullName,
        username: normalizeUsername(createForm.username),
        password: createForm.password,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        role: createForm.role as UserRole,
        department: createForm.department
          ? (createForm.department as Department)
          : undefined,
      });
      setIsCreateOpen(false);
      setCreateForm({ ...emptyCreate });
      setShowPassword(false);
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao criar usuário"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      await updateUser({
        id: editingUser._id,
        name: editForm.name.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        role: editForm.role ? (editForm.role as UserRole) : undefined,
        department: editForm.department
          ? (editForm.department as Department)
          : undefined,
      });
      setEditingUser(null);
    } catch (error) {
      Alert.alert("Erro", getErrorMessage(error, "Erro ao atualizar usuário"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggleActive(user: User) {
    const deactivate = user.isActive;
    Alert.alert(
      deactivate ? "Desativar usuário" : "Reativar usuário",
      `${deactivate ? "Desativar" : "Reativar"} ${user.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: deactivate ? "Desativar" : "Reativar",
          style: deactivate ? "destructive" : "default",
          onPress: async () => {
            try {
              if (deactivate) await removeUser({ id: user._id });
              else await reactivateUser({ id: user._id });
            } catch (error) {
              Alert.alert(
                "Erro",
                getErrorMessage(error, "Erro ao alterar status")
              );
            }
          },
        },
      ]
    );
  }

  function openEdit(user: User) {
    setEditForm({
      name: user.name,
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role,
      department: user.department ?? "",
    });
    setEditingUser(user);
  }

  if (currentUser === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-8">
        <Text className="text-xl font-bold text-foreground">
          Acesso restrito
        </Text>
        <Text className="text-center text-muted-foreground">
          Somente administradores podem gerenciar usuários.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-foreground">Usuários</Text>
          <Text className="mt-1 text-muted-foreground">
            Gerencie os usuários do sistema.
          </Text>
        </View>
        <Button size="sm" onPress={() => setIsCreateOpen(true)}>
          <Plus size={16} color="#fafafa" />
          <ButtonText className="ml-1.5">Novo</ButtonText>
        </Button>
      </View>

      <View className="flex-row items-center rounded-md border border-input bg-card px-3">
        <Search size={16} color="#9ca3af" />
        <Input
          placeholder="Buscar por nome, email ou username..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          className="h-12 flex-1 border-0 bg-transparent"
        />
      </View>

      <View className="flex-row gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = filterStatus === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilterStatus(f.value)}
              className={`rounded-full px-4 py-2 ${active ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text
                className={
                  active
                    ? "text-sm font-medium text-primary-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="text-sm text-muted-foreground">
        {filteredUsers.length} usuário{filteredUsers.length === 1 ? "" : "s"}
      </Text>

      {!users ? (
        <View className="items-center justify-center py-12">
          <ActivityIndicator size="large" />
        </View>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <Text className="text-center text-muted-foreground">
              Nenhum usuário encontrado
            </Text>
          </CardContent>
        </Card>
      ) : (
        <View className="gap-2">
          {filteredUsers.map((user) => (
            <UserCard
              key={user._id}
              user={user}
              onEdit={() => openEdit(user)}
              onToggle={() => handleToggleActive(user)}
            />
          ))}
        </View>
      )}

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(o) => setIsCreateOpen(o)}>
        <DialogHeader>
          <DialogTitle>Criar Usuário</DialogTitle>
        </DialogHeader>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="João"
                value={createForm.firstName}
                onChangeText={(v) =>
                  setCreateForm((f) => ({ ...f, firstName: v }))
                }
                className="h-12"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Label>Sobrenome *</Label>
              <Input
                placeholder="Silva"
                value={createForm.lastName}
                onChangeText={(v) =>
                  setCreateForm((f) => ({ ...f, lastName: v }))
                }
                className="h-12"
              />
            </View>
          </View>
          <View className="gap-1.5">
            <Label>Username (login) *</Label>
            <Input
              placeholder="joao.silva"
              value={createForm.username}
              onChangeText={(v) =>
                setCreateForm((f) => ({
                  ...f,
                  username: sanitizeUsernameInput(v),
                }))
              }
              autoCapitalize="none"
              autoCorrect={false}
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Senha *</Label>
            <View className="flex-row items-center rounded-md border border-input bg-card px-3">
              <Input
                placeholder="Mínimo 8 caracteres"
                value={createForm.password}
                onChangeText={(v) =>
                  setCreateForm((f) => ({ ...f, password: v }))
                }
                secureTextEntry={!showPassword}
                className="h-12 flex-1 border-0 bg-transparent"
              />
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                {showPassword ? (
                  <EyeOff size={18} color="#9ca3af" />
                ) : (
                  <Eye size={18} color="#9ca3af" />
                )}
              </Pressable>
            </View>
          </View>
          <View className="gap-1.5">
            <Label>Email</Label>
            <Input
              placeholder="joao@empresa.com"
              value={createForm.email}
              onChangeText={(v) => setCreateForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Telefone</Label>
            <Input
              placeholder="(11) 99999-9999"
              value={createForm.phone}
              onChangeText={(v) => setCreateForm((f) => ({ ...f, phone: v }))}
              keyboardType="phone-pad"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Cargo *</Label>
            <Select
              value={createForm.role}
              onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}
              options={ROLE_OPTIONS}
              placeholder="Selecione o cargo"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Departamento</Label>
            <Select
              value={createForm.department}
              onValueChange={(v) =>
                setCreateForm((f) => ({ ...f, department: v }))
              }
              options={DEPARTMENT_OPTIONS}
              placeholder="Selecione o departamento"
              className="h-12"
            />
          </View>
        </View>
        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => {
              setIsCreateOpen(false);
              setCreateForm({ ...emptyCreate });
              setShowPassword(false);
            }}
          >
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button disabled={isSubmitting} onPress={handleCreate}>
            <ButtonText>{isSubmitting ? "Criando..." : "Criar"}</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(o) => !o && setEditingUser(null)}
      >
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <View className="gap-3">
          <View className="gap-1.5">
            <Label>Nome completo</Label>
            <Input
              value={editForm.name}
              onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Email</Label>
            <Input
              value={editForm.email}
              onChangeText={(v) => setEditForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Telefone</Label>
            <Input
              value={editForm.phone}
              onChangeText={(v) => setEditForm((f) => ({ ...f, phone: v }))}
              keyboardType="phone-pad"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Cargo</Label>
            <Select
              value={editForm.role}
              onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}
              options={ROLE_OPTIONS}
              placeholder="Selecione o cargo"
              className="h-12"
            />
          </View>
          <View className="gap-1.5">
            <Label>Departamento</Label>
            <Select
              value={editForm.department}
              onValueChange={(v) =>
                setEditForm((f) => ({ ...f, department: v }))
              }
              options={DEPARTMENT_OPTIONS}
              placeholder="Nenhum"
              className="h-12"
            />
          </View>
        </View>
        <DialogFooter>
          <Button variant="outline" onPress={() => setEditingUser(null)}>
            <ButtonText variant="outline">Cancelar</ButtonText>
          </Button>
          <Button disabled={isSubmitting} onPress={handleUpdate}>
            <ButtonText>{isSubmitting ? "Salvando..." : "Salvar"}</ButtonText>
          </Button>
        </DialogFooter>
      </Dialog>
    </ScrollView>
  );
}

function UserCard({
  user,
  onEdit,
  onToggle,
}: {
  user: User;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {user.name}
          </Text>
          {user.email ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
          {user.username ? (
            <Text className="font-mono text-xs text-muted-foreground">
              @{user.username}
            </Text>
          ) : null}
        </View>
        <View className="flex-row gap-1">
          <Pressable
            onPress={onEdit}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-md bg-muted/50"
          >
            <Pencil size={16} color="#52525b" />
          </Pressable>
          <Pressable
            onPress={onToggle}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-md bg-muted/50"
          >
            {user.isActive ? (
              <UserX size={16} color="#ef4444" />
            ) : (
              <UserCheck size={16} color="#16a34a" />
            )}
          </Pressable>
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
        {user.department ? (
          <Badge variant="secondary">
            {DEPARTMENT_LABELS[user.department] ?? user.department}
          </Badge>
        ) : null}
        <Badge variant={user.isActive ? "success" : "secondary"}>
          {user.isActive ? "Ativo" : "Inativo"}
        </Badge>
      </View>
    </Card>
  );
}
