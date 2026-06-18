import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  Plus,
  Pencil,
  Search,
  UserX,
  UserCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AuthShell } from "@/components/auth-shell";
import { getErrorMessage } from "@/lib/errors";

type User = FunctionReturnType<typeof api.users.list>[number];

export const Route = createFileRoute("/rh/usuarios")({
  component: UsuariosPage,
});

const ROLE_LABELS: Record<string, string> = {
  director: "Diretor",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Operador QR",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  estoque: "Estoque",
  financeiro: "Financeiro",
  rh: "Recursos Humanos",
  engenharia: "Engenharia",
};

type CreateFormData = {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  role: string;
  department: string;
};

const emptyCreateForm: CreateFormData = {
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  role: "",
  department: "",
};

type EditFormData = {
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
};

function UsuariosPage() {
  return (
    <AuthShell>
      <UsuariosContent />
    </AuthShell>
  );
}

function UsuariosContent() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.list, {});
  const createUser = useAction(api.userAdmin.adminCreateUser);
  const updateUser = useMutation(api.users.update);
  const removeUser = useMutation(api.users.remove);
  const reactivateUser = useMutation(api.users.reactivate);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormData>({
    ...emptyCreateForm,
  });
  const [editForm, setEditForm] = useState<EditFormData>({
    name: "",
    email: "",
    phone: "",
    role: "",
    department: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];
    if (filterStatus === "active") {
      result = result.filter((u) => u.isActive);
    } else if (filterStatus === "inactive") {
      result = result.filter((u) => !u.isActive);
    }
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

  const handleCreate = async () => {
    if (!createForm.firstName.trim()) {
      toast.error("Informe o nome");
      return;
    }
    if (!createForm.lastName.trim()) {
      toast.error("Informe o sobrenome");
      return;
    }
    if (!createForm.username.trim()) {
      toast.error("Informe o username");
      return;
    }
    if (createForm.password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (!createForm.role) {
      toast.error("Selecione o cargo");
      return;
    }

    setIsSubmitting(true);
    try {
      const fullName = `${createForm.firstName.trim()} ${createForm.lastName.trim()}`;
      await createUser({
        name: fullName,
        username: createForm.username.trim().toLowerCase(),
        password: createForm.password,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        role: createForm.role as
          | "director"
          | "admin"
          | "manager"
          | "operator"
          | "engenheiro"
          | "qr_operator",
        department: createForm.department
          ? (createForm.department as
              | "estoque"
              | "financeiro"
              | "rh"
              | "engenharia")
          : undefined,
      });
      toast.success("Usuário criado com sucesso");
      setIsCreateOpen(false);
      setCreateForm({ ...emptyCreateForm });
      setShowPassword(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar usuário"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      await updateUser({
        id: editingUser._id,
        name: editForm.name.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        role: editForm.role
          ? (editForm.role as
              | "director"
              | "admin"
              | "manager"
              | "operator"
              | "engenheiro"
              | "qr_operator")
          : undefined,
        department: editForm.department
          ? (editForm.department as
              | "estoque"
              | "financeiro"
              | "rh"
              | "engenharia")
          : undefined,
      });
      toast.success("Usuário atualizado");
      setEditingUser(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar usuário"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      if (user.isActive) {
        await removeUser({ id: user._id });
        toast.success("Usuário desativado");
      } else {
        await reactivateUser({ id: user._id });
        toast.success("Usuário reativado");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao alterar status"));
    }
  };

  const openEdit = (user: User) => {
    setEditForm({
      name: user.name,
      email: user.email ?? "",
      phone: user.phone ?? "",
      role: user.role,
      department: user.department ?? "",
    });
    setEditingUser(user);
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">
          Somente administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">
            Gerencie os usuários do sistema
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Usuário</DialogTitle>
              <DialogDescription>
                Crie um novo usuário com acesso ao sistema. As credenciais serão
                usadas para login.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="create-firstName">Nome *</Label>
                  <Input
                    id="create-firstName"
                    placeholder="João"
                    value={createForm.firstName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-lastName">Sobrenome *</Label>
                  <Input
                    id="create-lastName"
                    placeholder="Silva"
                    value={createForm.lastName}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-username">Username (login) *</Label>
                <Input
                  id="create-username"
                  placeholder="joao.silva"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      username: e.target.value.toLowerCase().replace(/\s/g, ""),
                    }))
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-password">Senha *</Label>
                <div className="relative">
                  <Input
                    id="create-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="joao@empresa.com"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-phone">Telefone</Label>
                <Input
                  id="create-phone"
                  placeholder="(11) 99999-9999"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Cargo *</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, role: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Departamento</Label>
                <Select
                  value={createForm.department}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, department: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreateForm({ ...emptyCreateForm });
                  setShowPassword(false);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? "Criando..." : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredUsers.length} usuário{filteredUsers.length !== 1 && "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!users ? (
            <p className="text-center text-muted-foreground py-8">
              Carregando...
            </p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum usuário encontrado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          {user.email && (
                            <p className="text-sm text-muted-foreground">
                              {user.email}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {user.username ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.department
                          ? DEPARTMENT_LABELS[user.department] ??
                            user.department
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            user.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-gray-100 text-gray-500"
                          }
                        >
                          {user.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(user)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(user)}
                            title={
                              user.isActive ? "Desativar" : "Reativar"
                            }
                          >
                            {user.isActive ? (
                              <UserX className="h-4 w-4 text-destructive" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Altere as informações do usuário {editingUser?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome completo</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Cargo</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, role: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Departamento</Label>
              <Select
                value={editForm.department}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, department: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
