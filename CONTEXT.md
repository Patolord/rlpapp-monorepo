# Domain language

The vocabulary of RLP Engenharia's business and of this code. One concept, one
name: a term here means the same thing in conversations, the UI, the code and
the docs. `packages/backend/tests/glossary.test.ts` fails when a table or a
domain of `convex/model/` is missing from this file.

## How the language is used

- **UI text is pt-BR; code is English.** This file is the translation table:
  each term gives the word the user sees (UI) and the identifiers the code uses
  (Code). New code uses the Code name; it never invents a second translation.
- **Loanwords.** A few business terms have no faithful English word, or the
  English word would collide with another concept. The code keeps the pt-BR
  word: *medição* (`medicoes`, because "measurement" is what the estimator does
  in the takeoff app), *BDI*, *obra* in URL segments (`obraSlug`; URLs are UI).
- **Frozen identifiers.** Table names, enum values stored in documents and
  permission keys (`obras.read`, `medicoes.aprovar`) are part of the data:
  renaming one needs a migration. Some are pt-BR for historical reasons
  (measurement statuses, punch kinds, staff groups, equipment kinds); they are
  listed below as they are. New tables and enums are English.
- **Errors speak the UI language.** A refusal is a typed `ConvexError`
  (`notFound`, `alreadyExists`, `ruleViolation` in `convex/lib/domainErrors.ts`)
  whose pt-BR message uses the UI term ("Obra não encontrada"), so the user,
  the MCP agent and `/api/v1` all read the same sentence.
- **One label per value.** When web and the mobile app both show an enum, its
  pt-BR label is defined once in `packages/shared` (e.g.
  `EQUIPMENT_STATUS_LABELS`, `INVENTORY_DOCUMENT_STATUS_LABELS`) and both
  import it; an app may add its own color or icon, not its own word.
- **Avoid** lines name synonyms that must not be used for that concept.

## Context map

Each domain of `packages/backend/convex/model/` owns its tables (`schema/<domain>.ts`)
and the rules about them. A domain may only call the domains it depends on;
ESLint enforces the arrows (`DOMAIN_DEPENDENCIES` in
`packages/backend/eslint.config.mjs`), so the graph stays acyclic. Reading
another domain's table for a lookup is fine; changing it goes through that
domain's model functions.

| Domain (`model/…`) | Business area (UI) | Depends on |
| --- | --- | --- |
| `kernel` | Shared kernel: text normalization, CPF/CNPJ, bulk import results | — |
| `identity` | Usuários, acessos, agentes (MCP), auditoria | — |
| `notifications` | Notificações (sino e push) | — |
| `engineering` | Engenharia: obras, estrutura do prédio, equipamentos, etiquetas QR, campo | notifications |
| `contracts` | Clientes, empreiteiros, contratos, medições | engineering, notifications |
| `procurement` | Compras: materiais, fornecedores, preços, takeoffs, App Takeoff | engineering, notifications |
| `inventory` | Estoque: locais, movimentações, saldos, reposição, pedidos de obra | engineering, procurement, notifications |
| `hr` | RH: funcionários, folha de pagamento, ponto | — |
| `ai` | Assistente da obra | engineering |

Every domain may use `kernel`; `kernel` uses none. Cross-cutting
infrastructure (auth, permissions, audit, errors, crypto) lives in `convex/lib/`
and is not a domain.

## Identity and access

### User
UI: "Usuário". Code: `users`.
A person who signs in (Clerk). Not an employee record: payroll lives in
Employee, and the time clock belongs to the user.

### Access role
UI: the role names in Configurações → Usuários ("Engenharia", "Compras",
"Estoque", "Recursos Humanos", "App Takeoff", "Técnico de campo", "Portal do
cliente", "Diretoria", "Administração"). Code: `users.roles` (`accessRoles`).
Combinable grants of feature permissions. The legacy single `role` and
`department` fields are read only by a migration.

### Permission
UI: the permission labels in Configurações → Usuários. Code: keys like
`obras.read`, `medicoes.aprovar` (`packages/shared/src/auth/permissions.ts`),
`users.permissionGrants`, `users.permissionDenials`.
One capability on one feature. Roles grant sets of them; grants and denials
adjust one user. Apps check `can(user, "x.y")`, never role names.

### Field technician
UI: "Técnico de campo". Code: access role `qr_operator`; `projects.technicianIds`.
A person on site who scans labels, registers equipment and logs work.
Avoid: operator (in prose).

### Portal user
UI: "Portal do cliente". Code: access role `client`; `projects.portalUserIds`.
An authenticated person granted read access to one or more customer
projects. A portal user is not the customer record itself.

### Agent token
UI: "Agentes (MCP)", "Token". Code: `agentTokens` (`kind: "agent"`).
A long-lived credential an AI agent uses to act as its owner through the MCP
server or `/api/v1`, with full or read-only access. Each tool call is logged in
`agentTokenCalls` ("Atividade recente").

### Device token
UI: "App desktop" badge on the Agents page. Code: `agentTokens` with
`kind: "device"`; one-time login codes in `takeoffAuthCodes`.
The token the takeoff desktop app receives when a user signs in through
`/takeoff/conectar` (PKCE). One per installation.

### Audit log
UI: "Atividade recente". Code: `auditLogs`, `logAudit` (`convex/lib/audit.ts`).
Who changed which record, when, and the field-level before/after.

## Notifications

### Notification
UI: "Notificação", "aviso"; the bell is "o sino". Code: `notifications`,
`notify()` (`model/notifications/notify.ts`).
A message to one person, written in the mutation that caused it and kept 60
days. It may also go out as a push.

### Push device
UI: not shown. Code: `pushTokens`, `pushTickets`.
A phone registered for push (Expo token). Pending Expo receipts are push
tickets; a phone that uninstalled the app is disabled from its receipt.

### Notification preferences
UI: "Preferências de notificação". Code: `notificationPreferences`.
Which categories a person does not want as push, and whether the quiet hours
(21h–6h) apply. The bell always receives everything.

## Engineering

### Project
UI: "Obra". Code: `projects` (`projectId`; URL segment `obraSlug`).
A construction project delivered for a customer. Statuses: `planning`
("Planejamento"), `in_progress` ("Em andamento"), `completed` ("Concluída"),
`paused` ("Pausada"), `archived` ("Arquivada").
Avoid: job, site, building (for the record).

### Geofence
UI: "Cerca". Code: `projects.geofence`.
Center and radius of a project's site. A time clock punch inside it counts for
that project.

### Project document
UI: "Documentos". Code: `projectDocuments`.
A PDF attached to a project by engineering, optionally visible to all or to
chosen field technicians ("Técnicos escolhidos").

### Building structure
The physical breakdown of a project, used to place equipment:

- **Tower**: UI "Torre" (or block). Code: `towers`.
- **Floor**: UI "Andar". Code: `floors`. Avoid: "pavimento".
- **Environment**: UI "Ambiente". Code: `environments` (`environmentId`).
  A room or space of a floor ("Sala de Estar", "Apto 201"), drawn on the
  building grid; may span floors (duplex) or form an L. Not the takeoff
  desktop's Location, and not a deployment environment.
- **Project unit (legacy)**: UI "Unidade", "Apartamento". Code: `projectUnits`.
  The older apartment-based layout (floor → "final"). Old projects still use
  it; new projects use towers, floors and environments.

### System
UI: "Sistema". Code: `systems` (`systemId`; `projectEquipment.system` holds its name).
An HVAC system of one project ("VRF 1", "Split") grouping equipment that may
sit in different environments (condenser on the roof, evaporators in the
apartments).

### Planned equipment
UI: "Equipamento" (the project's planned panel). Code: `projectEquipment`;
`kind`: `condensadora` / `evaporadora`.
A line of the project's equipment plan (the old "Tabela Global de
Equipamentos"): model, capacity, place and system. It becomes installed when
linked to an installed equipment.
Avoid: calling it just "equipment" in code; say planned equipment.

### Installed equipment
UI: "Equipamento". Code: `equipment`. Statuses (`equipmentStatusValidator`):
`installing` ("Instalando"), `operational` ("Operacional"), `warning`
("Atenção"), `error` ("Erro"), from `packages/shared/src/engenharia/equipment.ts`.
A physical unit registered on site by a field technician, with a QR label and
a photo of its nameplate, linked to the planned equipment it fulfils.

### QR label
UI: "Etiqueta", "Etiquetas QR". Code: `qrCodes` (`token`).
A printed label whose token identifies one installed equipment. Scanning it
("Escanear etiqueta") opens the equipment in the field app.

### Label batch
UI: "Lote". Code: `qrBatches` (`batchId`).
A set of labels sent to the printer, optionally destined to one project: a
label of that batch cannot be used on another project.

### Equipment log
UI: "Manutenção" ("Nova Manutenção"), type "Instalação" or "Manutenção".
Code: `maintenanceLogs` (`type`: `installation` / `maintenance`).
A field record on an installed equipment: tags, tests (vacuum, pressure,
communication, gas), photos and status.

### Equipment history
UI: "Histórico". Code: `equipmentHistory`, `logEquipmentHistory`.
The timeline of a planned equipment: installation, tests, status changes,
checklist items, with who and where.

### Checklist
UI: "Checklist". Code: `checklistTemplates` (a reusable template, per project
or global), `checklistItems` (its items instantiated on one planned
equipment).

## Contracts

### Customer
UI: "Cliente". Code: `customers`, `customerContacts`.
The person or organization purchasing work delivered through a project.

### Contractor
UI: "Empreiteiro". Code: `contractors`, `contractorContacts`.
A third party hired to perform work for a project.
Avoid: supplier (a supplier sells materials).

### Contract
UI: "Contrato". Code: `contracts`; `direction`: `client_sale` ("Venda ao
cliente") or `contractor_hire` ("Contratação de empreiteiro"); `kind`: `base`
("Contrato base") or `addendum` ("Aditivo", `parentContractId`).
An agreement either to sell services to a customer or to hire a contractor.
Its value is the sum of its service items.

### Service item
UI: "Itens de serviço". Code: `contractServiceItems`.
A priced line of work in a contract.

### Medição
UI: "Medição". Code: `medicoes` (loanword, see above); `basis`: `percentual`
("% do contrato"), `valor_fixo` ("Valor fixo"), `progresso_equipamentos`
("Progresso de equipamentos"); `status`: `rascunho` → `aprovada` → `paga`.
A record of billable progress against a customer-sale contract with a
project, numbered within the contract. Not a takeoff marking.
Avoid: measurement (in code), invoice.

## Procurement

### Material
UI: "Material". Code: `materials` (`sku` "SKU", e.g. MAT-000123; `status`:
`draft`, `active`, `archived`; `mergedIntoId` after a merge).
A catalog item independent of how much stock exists at any location.
SKU numbers come from `materialSkuCounters`.

### Material family and variant
UI: "Família", "Variante". Code: `materialFamilies`, `materials.variantLabel`,
`materials.identityKey`.
A family is the base product ("Tubo de cobre"); a material is one variant of
it (size, gauge, finish). The identity key is family plus defining attributes,
so the same variant is never registered twice.

### Alias
UI: "Alias", "Nome alternativo". Code: `materialAliases`.
Another name people use for a material ("cobre 1/4"), used by lookups and the
assistant to find it.

### Supplier
UI: "Fornecedor". Code: `suppliers`, `supplierContacts`.
A vendor that provides materials. A supplier is distinct from a contractor.

### Supplier material
UI: "Fornecedor vinculado" (in the material sheet). Code: `supplierMaterials`.
The link between a supplier and a material: the supplier's code and
description, purchase unit, lead time and whether it is the preferred one.

### Price event
UI: "Eventos de Preço", "Preço registrado"; review queue "Fila de Revisão".
Code: `priceEvents`; `source`: `manual`, `quote` ("Cotação"), `purchase`
("Compra"), `invoice` ("Nota fiscal"), `whatsapp`, `supplier_form`
("Formulário"), `excel_import` ("Planilha"); `reviewStatus`.
One observed unit price of a material (or of a raw description) from a
supplier at a date. Suggested prices and price history are computed from them.
Avoid: quote (a quote is one source of price events).

### Material import row
UI: not shown. Code: `materialImportRows`.
The memory of which source spreadsheet row created which material, so
importing the same sheet twice changes nothing.

### Purchasing takeoff
UI: "Takeoff" (under Compras), "Itens do takeoff". Code: `takeoffs`,
`takeoffItems`; takeoff `status`: `draft`, `pricing` ("Em precificação"),
`quoted` ("Cotado"), `approved` ("Aprovado"), `archived`; item `status`:
`draft`, `needs_review` ("Revisar"), `matched` ("Vinculado"),
`sent_to_supplier`, `quoted`, `selected`, `purchased` ("Comprado").
A list of materials and quantities for a project kept in the backend, whose
lines purchasing links to catalog materials and prices. A budget published
from the takeoff desktop arrives as a purchasing takeoff (`source: "desktop"`).
Not the same as the takeoff desktop.

### Material proposal
UI: not named. Code:
`takeoffMaterialProposals`.
A request from the takeoff desktop to create or match a catalog material for
an item the catalog lacks. One per client id, so retries are safe.

### App Takeoff settings
UI: "App Takeoff" → "Gerais e presets". Code: `takeoffKits` (company kits,
"Presets (kits)"), `takeoffSettings` (weights, base prices per kg, VRF brands,
labour, duct norms), `takeoffPriceHistory` (history of base prices per kg).
Company defaults the takeoff desktop downloads with the catalog and applies
under each user's local changes.

## Inventory

### Inventory location
UI: "Estoque central" or the project's stock ("Obra"); "Local de estoque".
Code: `inventoryLocations` (`type`: `central` / `project`).
A place that holds stock: the central warehouse or one project.

### Movement
UI: "Movimentação" ("Nova movimentação"). Code: `inventoryDocuments`,
`inventoryDocumentItems`; `type`: `entry` ("Entrada"), `transfer` ("Envio
para obra"), `consumption` ("Consumo"), `return` ("Retorno"), `adjustment`
("Ajuste"), `reversal` ("Estorno"); `status`: `draft` ("Rascunho"),
`pending_approval` ("Aguardando aprovação"), `approved` ("Exceção aprovada"),
`posted` ("Concluída"), `rejected` ("Recusada"), `reversed` ("Estornada"),
from `packages/shared/src/estoque/movements.ts`.
A document that moves materials between locations. Posting it writes stock
events and updates balances; a posted movement is never edited, only reversed.
One that breaks a compatibility rule waits for approval.
Avoid: transaction, order.

### Stock event
UI: not shown. Code: `inventoryEvents` (`quantityDelta`).
One line of the stock ledger: a quantity in or out of one location, written
when a movement is posted.

### Inventory balance
UI: "Saldo". Code: `inventoryBalances`.
The quantity of one material available at one inventory location.

### Replenishment policy
UI: "Política de reposição": "Estoque mínimo", "Ponto de reposição", "Meta de
estoque", "Prazo de reposição". Code: `inventoryStockPolicies`
(`minimumQuantity`, `reorderPoint`, `targetQuantity`, `leadTimeDays`);
state `replenishmentState`: `unconfigured` ("Sem política"), `healthy` ("OK"),
`reorder` ("Repor"), `below_minimum` ("Crítico").
When a material at a location needs buying.

### Compatibility rule
UI: "Regras de compatibilidade". Code: `inventoryCompatibilityRules`.
A pair of materials (or categories) that must not go together, or must share
an attribute; a movement breaking one needs approval.

### Material request
UI: "Pedido de material", "Pedidos de obra". Code: `inventoryRequests`,
`inventoryRequestItems`; `status`: `pending`, `approved`, `rejected`,
`cancelled`, `fulfilled` ("Enviado").
A project's request for materials from the central warehouse, fulfilled by a
transfer movement.
Avoid: purchase order.

## HR

### Employee
UI: "Funcionário". Code: `employees`; `staffGroup`: `obra`, `escritorio`,
`diretoria` ("Equipe"); `status`: `active`, `on_leave` ("Afastado"),
`terminated` ("Desligado").
A person on the payroll. Not a user: an employee may never sign in.

### Payroll run
UI: "Folha de pagamento", "Folha"; its month is the "Competência". Code:
`payrollRuns` (`status`: `draft` / `closed`), `payrollLines` (one snapshot of
each employee in the run).
The monthly payroll: earnings, deductions, vouchers and the total to pay
each employee. A closed run is not edited until reopened.

### Employee loan
UI: "Empréstimo". Code: `employeeLoans`.
A loan to an employee, paid back in monthly installments deducted in the payroll.

### Alimony
UI: "Pensão". Code: `employeeAlimonies`, `payrollAlimonyLines`.
A monthly payment to a beneficiary on behalf of an employee, its own line of
the payroll, not part of the employee's deductions or total.

### Time clock punch
UI: "Ponto", "Marcação". Code: `clockPunches`; `kind`: `entrada`,
`almoco_saida` ("Saída almoço"), `almoco_retorno` ("Retorno almoço"),
`saida`.
One clock-in or clock-out of a user, with photo and/or position, a sequential
number (NSR, from `timeClockCounters`) and a hash for the receipt. The kind
comes from its position in the day.

### Clock day
UI: not named ("homem-dia" report). Code: `clockDays`.
The daily summary of one user's punches, the base of the monthly man-day
report.

### Clock settings
UI: "Configurar ponto". Code: `clockSettings`.
Whether photo and position are required, the duplicate window and the
man-day cost.

## Assistant

### Assistant conversation
UI: "Assistente", "Conversas da obra". Code: `aiChatSessions`,
`aiChatMessages`; proposed actions are intents (`model/ai/intents.ts`).
A user's chat with the AI assistant about one project. Its intents propose
structure and equipment changes the user applies.

## Takeoff desktop

### Takeoff Desktop

RLP Takeoff, the desktop app (`apps/takeoff`) in which an estimator measures
drawings and prices the result as a budget sheet (“planilha orçamentária”).
Its projects are local `*.takeoff.json` files. Not the same as a purchasing
takeoff.

### Drawing

One PDF of a takeoff desktop project. The product interface calls it a
“planta.” Markings, page scales and the regions of locations belong to a
drawing; items and locations are shared by the whole project.

### Marking

A count, run or area drawn on a drawing page for one item. The product
interface calls it a “marcação.” A marking is not a medição, which is billable
progress on a contract.

### Location

A named place (floor, apartment, room) of the whole project, drawn as one or
more regions; each region lies on one page of one drawing, and the markings
inside a region are grouped under the location in the budget. The product
interface calls it a “local” or “ambiente.” It lives in the desktop project
file and is not the backend's Environment.

### Discipline

A tab of a takeoff desktop budget workbook (Exaustão, Infra AC, AC Pesado…),
with its own extras and BDI. The product interface calls it a “disciplina” or
“aba.” It is a sales grouping chosen by the estimator, not a property of the
material: each item has its own discipline, and a marking may name another
(“Marcar em” while drawing, or the selection's “Disciplina”), so one item can be
split over several tabs, each with the quantity of its markings.

### Kit

A preset that creates one linked marking per material from a single run or
click (a split's line set: copper, insulation and cable together). Company
kits are edited in App Takeoff (`takeoffKits`).

### Item

A line of a takeoff desktop budget: a material or service with a unit, budget
group, material and labour unit prices and optional waste. Its quantity is
measured from its markings (runs also add their vertical lengths), except for
a duct network or VRF system, whose markings price it rather than measure it.
A duct network always has quantity 1 (“cj”); a VRF system has a number of
identical sets (“cj”) entered by hand.

### Duct Network

A budget item whose sheet metal, insulation, flanges, supports and labour are
computed from the rectangular duct runs drawn on it (NBR 16401). The product
interface calls it a “rede de dutos.”

### VRF System

A budget item for one VRF refrigerant system (condenser and evaporators),
priced from its refrigerant runs, with tube diameters sized by the brand's
tables. The product interface calls it a “sistema VRF.”

### BDI

The multiplier applied to a discipline tab's grand total (“TOTAL GERAL”) to
reach its selling price; 1.42 means 42 % on top of cost. The project sets a
default and each discipline tab may override it, so the selling price of the
whole budget is the sum of the tabs' selling prices, not the overall total
times one BDI.
