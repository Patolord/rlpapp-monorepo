import { v } from "convex/values";
import {
  aprovacaoStatus,
  categoriaTipo,
  contaPagarStatus,
  contaReceberStatus,
  formaPagamento,
  tipoConta,
} from "../schema";

export const aprovacaoDoc = v.object({
  _id: v.id("aprovacoes"),
  _creationTime: v.number(),
  contaPagarId: v.id("contasPagar"),
  aprovadorId: v.string(),
  status: aprovacaoStatus,
  observacao: v.optional(v.string()),
  createdAt: v.number(),
});

// Validadores de documentos completos (com _id/_creationTime) para uso em
// `returns` das funções públicas do módulo financeiro.

export const categoriaFinanceiraDoc = v.object({
  _id: v.id("categoriasFinanceiras"),
  _creationTime: v.number(),
  nome: v.string(),
  tipo: categoriaTipo,
  cor: v.optional(v.string()),
  icone: v.optional(v.string()),
  isActive: v.boolean(),
});

export const contaBancariaDoc = v.object({
  _id: v.id("contasBancarias"),
  _creationTime: v.number(),
  nome: v.string(),
  banco: v.string(),
  agencia: v.string(),
  conta: v.string(),
  tipo: tipoConta,
  saldoInicial: v.number(),
  isActive: v.boolean(),
});

export const clienteDoc = v.object({
  _id: v.id("clientes"),
  _creationTime: v.number(),
  nome: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  documento: v.optional(v.string()),
  endereco: v.optional(v.string()),
  isActive: v.boolean(),
});

export const supplierDoc = v.object({
  _id: v.id("suppliers"),
  _creationTime: v.number(),
  name: v.string(),
  contactName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(v.string()),
  isActive: v.boolean(),
});

const contaPagarFields = {
  _id: v.id("contasPagar"),
  _creationTime: v.number(),
  descricao: v.string(),
  valor: v.number(),
  dataVencimento: v.number(),
  dataPagamento: v.optional(v.number()),
  dataCompetencia: v.number(),
  status: contaPagarStatus,
  categoriaId: v.optional(v.id("categoriasFinanceiras")),
  fornecedorId: v.optional(v.id("suppliers")),
  contaBancariaId: v.optional(v.id("contasBancarias")),
  formaPagamento: v.optional(formaPagamento),
  recorrente: v.optional(v.boolean()),
  observacoes: v.optional(v.string()),
  userId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const contaPagarDoc = v.object(contaPagarFields);

/** Conta a pagar com relacionamentos resolvidos (joins do list/getById). */
export const contaPagarEnriched = v.object({
  ...contaPagarFields,
  categoria: v.union(categoriaFinanceiraDoc, v.null()),
  fornecedor: v.union(supplierDoc, v.null()),
  contaBancaria: v.union(contaBancariaDoc, v.null()),
});

const contaReceberFields = {
  _id: v.id("contasReceber"),
  _creationTime: v.number(),
  descricao: v.string(),
  valor: v.number(),
  valorRecebido: v.number(),
  dataVencimento: v.number(),
  dataRecebimento: v.optional(v.number()),
  dataCompetencia: v.number(),
  dataEmissao: v.number(),
  status: contaReceberStatus,
  categoriaId: v.optional(v.id("categoriasFinanceiras")),
  clienteId: v.optional(v.id("clientes")),
  contaBancariaId: v.optional(v.id("contasBancarias")),
  formaPagamento: v.optional(formaPagamento),
  notaFiscal: v.optional(v.string()),
  observacoes: v.optional(v.string()),
  userId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const contaReceberDoc = v.object(contaReceberFields);

/** Conta a receber com relacionamentos resolvidos (joins do list/getById). */
export const contaReceberEnriched = v.object({
  ...contaReceberFields,
  categoria: v.union(categoriaFinanceiraDoc, v.null()),
  cliente: v.union(clienteDoc, v.null()),
  contaBancaria: v.union(contaBancariaDoc, v.null()),
});
