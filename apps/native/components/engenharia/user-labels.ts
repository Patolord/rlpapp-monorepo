export type UserRole = "director" | "admin" | "manager" | "operator" | "engenheiro" | "qr_operator" | "client";
export type Department = "rh" | "engenharia" | "compras" | "estoque";

export const ROLE_LABELS: Record<UserRole, string> = {
  director: "Diretor",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Técnico de campo",
  client: "Cliente",
};

export const ROLE_HINT: Record<UserRole, string> = {
  director: "Vê e faz tudo",
  admin: "Vê e faz tudo",
  manager: "Escritório; a área vem do departamento",
  operator: "Escritório; a área vem do departamento",
  engenheiro: "Engenharia, consulta compras e estoque",
  qr_operator: "App de campo: obras, etiquetas e ponto",
  client: "Portal do cliente, só leitura",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  engenharia: "Engenharia",
  compras: "Compras",
  estoque: "Estoque",
  rh: "Recursos Humanos",
};
