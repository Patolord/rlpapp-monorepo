import { api } from "@rlpapp/backend/convex/_generated/api";
import { normalizeUsername, sanitizeUsernameInput } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, Lock, Plus, UserRound, Users } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { DEPARTMENT_LABELS, ROLE_HINT, ROLE_LABELS, type Department, type UserRole } from "@/components/engenharia/user-labels";
import { AppButton, Banner, Chips, ConfirmDialog, EmptyState, Field, IconButton, ListRow, LoadingState, Pill, PickerField, SearchField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { isAdmin } from "@/lib/profile";
import { colors, space, type } from "@/lib/theme";

type User = FunctionReturnType<typeof api.users.list>[number];
type Filter = "active" | "inactive" | "all";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_HINT[r] }));
const DEPARTMENT_OPTIONS = (Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => ({ value: d, label: DEPARTMENT_LABELS[d] }));
const needsDepartment = (role: UserRole | null) => role === "manager" || role === "operator";

/** Usuários (ficha G12): só diretoria e administradores. */
export default function UsuariosScreen() {
  const me = useQuery(api.users.getCurrentUser);
  const admin = isAdmin(me);
  const users = useQuery(api.users.list, admin ? {} : "skip");
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (users ?? [])
      .filter((u) => filter === "all" || (filter === "active" ? u.isActive : !u.isActive))
      .filter((u) => !term || [u.name, u.email, u.username].some((v) => v?.toLocaleLowerCase("pt-BR").includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [users, filter, search]);

  if (me === undefined) return <LoadingState />;
  if (!admin) {
    return (
      <View style={{ padding: space.screen, backgroundColor: colors.bg, flex: 1 }}>
        <EmptyState icon={<Lock size={28} color={colors.primary} />} title="Você não tem acesso a esta área" description="Só a diretoria e os administradores gerenciam usuários. Fale com um administrador se precisar." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.top}>
        <View style={styles.searchRow}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Nome, e-mail ou usuário" containerStyle={{ flex: 1 }} autoCapitalize="none" />
          <IconButton label="Novo usuário" tone="primary" icon={<Plus size={22} color={colors.onPrimary} />} onPress={() => setCreating(true)} />
        </View>
        <Chips<Filter>
          active={filter}
          onChange={setFilter}
          style={{ paddingHorizontal: 0 }}
          items={[
            { key: "active", label: "Ativos", count: users?.filter((u) => u.isActive).length },
            { key: "inactive", label: "Desativados", count: users?.filter((u) => !u.isActive).length },
            { key: "all", label: "Todos" },
          ]}
        />
      </View>
      {users === undefined ? (
        <LoadingState />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(u) => u._id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListRow
              icon={<UserRound size={20} color={colors.primary} />}
              title={item.name}
              subtitle={[ROLE_LABELS[item.role as UserRole] ?? item.role, item.department ? DEPARTMENT_LABELS[item.department as Department] : null, item.username ? `@${item.username}` : item.email].filter(Boolean).join(" · ")}
              trailing={!item.isActive ? <Pill label="Desativado" dot={false} /> : !item.lastLoginAt ? <Pill label="Nunca entrou" tone="warning" /> : undefined}
              onPress={() => setEditing(item)}
            />
          )}
          ListEmptyComponent={<EmptyState icon={<Users size={28} color={colors.primary} />} title={search ? "Nada com essa busca" : "Nenhum usuário aqui"} />}
        />
      )}
      <CreateUserSheet open={creating} onClose={() => setCreating(false)} />
      <EditUserSheet user={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const create = useAction(api.userAdmin.adminCreateUser);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setUsername("");
    setPassword("");
    setEmail("");
    setPhone("");
    setRole(null);
    setDepartment(null);
    setTried(false);
    setError(null);
  }, [open]);

  const errors = {
    name: name.trim().split(/\s+/).length >= 2 ? undefined : "Informe nome e sobrenome",
    username: normalizeUsername(username) ? undefined : "Informe o usuário de acesso",
    password: password.length >= 8 ? undefined : "No mínimo 8 caracteres",
    role: role ? undefined : "Escolha o cargo",
    department: needsDepartment(role) && !department ? "Escolha o departamento" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  async function submit() {
    setTried(true);
    if (!valid || !role) return;
    setSaving(true);
    setError(null);
    try {
      await create({
        name: name.trim(),
        username: normalizeUsername(username),
        password,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        department: department ?? undefined,
      });
      toast.success("Usuário criado");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para criar o usuário. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Novo usuário" footer={<AppButton label="Criar usuário" block loading={saving} loadingLabel="Criando…" onPress={() => void submit()} />}>
      <View style={{ gap: space.lg }}>
        <Field label="Nome completo" value={name} onChangeText={setName} error={tried ? errors.name : undefined} />
        <Field label="Usuário de acesso" value={username} onChangeText={(v) => setUsername(sanitizeUsernameInput(v))} autoCapitalize="none" autoCorrect={false} helper="É o que a pessoa digita para entrar no app." error={tried ? errors.username : undefined} />
        <Field
          label="Senha inicial"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          error={tried ? errors.password : undefined}
          trailing={<IconButton tone="ghost" size={36} label={showPassword ? "Esconder senha" : "Mostrar senha"} icon={showPassword ? <EyeOff size={18} color={colors.icon} /> : <Eye size={18} color={colors.icon} />} onPress={() => setShowPassword((v) => !v)} />}
        />
        <Field label="E-mail (opcional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" helper="Se a pessoa entrar com este e-mail, a conta dela se liga a este usuário sozinha." />
        <Field label="Telefone (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <PickerField<UserRole> label="Cargo" value={role} options={ROLE_OPTIONS} onChange={setRole} error={tried ? errors.role : undefined} />
        {role && role !== "client" && role !== "qr_operator" ? (
          <PickerField<Department> label={needsDepartment(role) ? "Departamento" : "Departamento (opcional)"} value={department} options={DEPARTMENT_OPTIONS} onChange={setDepartment} clearable error={tried ? errors.department : undefined} />
        ) : null}
        {error ? <Banner tone="danger" title={error} /> : null}
      </View>
    </Sheet>
  );
}

function EditUserSheet({ user, onClose }: { user: User | null; onClose: () => void }) {
  const toast = useToast();
  const update = useMutation(api.users.update);
  const remove = useMutation(api.users.remove);
  const reactivate = useMutation(api.users.reactivate);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setRole(user.role as UserRole);
    setDepartment((user.department as Department | undefined) ?? null);
    setError(null);
  }, [user]);

  if (!user) return <Sheet open={false} onClose={onClose} title=""><View /></Sheet>;

  async function save() {
    if (!user || !role) return;
    setSaving(true);
    setError(null);
    try {
      await update({ id: user._id, name: name.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined, role, department: department ?? undefined });
      toast.success("Usuário salvo");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!user) return;
    setSaving(true);
    try {
      if (user.isActive) await remove({ id: user._id });
      else await reactivate({ id: user._id });
      toast.success(user.isActive ? "Usuário desativado" : "Usuário reativado");
      setConfirm(false);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para mudar o acesso"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={user.name}
        subtitle={user.username ? `@${user.username}` : user.email}
        footer={
          <View style={{ gap: space.sm }}>
            <AppButton label="Salvar" block loading={saving} onPress={() => void save()} />
            <AppButton label={user.isActive ? "Desativar acesso" : "Reativar acesso"} variant={user.isActive ? "danger" : "secondary"} block disabled={saving} onPress={() => setConfirm(true)} />
          </View>
        }
      >
        <View style={{ gap: space.lg }}>
          {user.lastLoginAt ? (
            <Text style={[type.caption, { color: colors.textSecondary }]}>Último acesso em {new Date(user.lastLoginAt).toLocaleString("pt-BR")}</Text>
          ) : (
            <Text style={[type.caption, { color: colors.warning }]}>Ainda não entrou no app.</Text>
          )}
          <Field label="Nome" value={name} onChangeText={setName} />
          <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <PickerField<UserRole> label="Cargo" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          {role && role !== "client" && role !== "qr_operator" ? (
            <PickerField<Department> label="Departamento" value={department} options={DEPARTMENT_OPTIONS} onChange={setDepartment} clearable />
          ) : null}
          {error ? <Banner tone="danger" title={error} /> : null}
        </View>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title={user.isActive ? `Desativar o acesso de ${user.name}?` : `Reativar o acesso de ${user.name}?`}
        description={user.isActive ? "A pessoa deixa de entrar no app e no web. O histórico continua. Dá para reativar depois." : "A pessoa volta a entrar com o mesmo usuário."}
        confirmLabel={user.isActive ? "Desativar" : "Reativar"}
        destructive={user.isActive}
        busy={saving}
        onConfirm={() => void toggleActive()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  top: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.lg },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
});
