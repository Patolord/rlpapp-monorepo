# apps/native

App mobile da RLP Engenharia (Expo 55, expo-router). O plano do redesign, as decisões e a
especificação tela a tela ficam no projeto "RLP" do claude.ai
(`claude/rlpapp-native-redesign.md`, `-navegacao.md`, `-notificacoes.md`, `-spec-telas.md`).

## Estrutura

- `app/(tabs)`: barra de abas do escritório, montada por perfil (`lib/profile.ts`:
  `resolveProfile` e `PROFILE_TABS`). Áreas com abas internas (Estoque, Compras, RH) usam
  `components/navigation/area-tabs.tsx`; Engenharia é uma pilha com menu.
- `app/campo`: app do técnico (`qr_operator`): Obras · Escanear · Pendentes · Ponto · Mais.
- `app/obra/[projectId]`: obra no escritório, com a faixa de abas por perfil no `_layout`.
- Telas empilhadas na raiz (`app/_layout.tsx`): notificações, aprovações, takeoff, lote,
  funcionário, ponto da equipe, equipamento, minhas marcações, portal do cliente.

## Visual

- Tudo sai de `lib/theme.ts` e dos componentes de `components/ui` (design system da Paloma
  adaptado ao celular). Não use `className`, `@rlpapp/ui/native` nem `Alert.alert`.
- Feedback (A2 §7): toast para ação concluída, `Banner` para situação da tela, erro no campo,
  `ConfirmDialog` para o que não tem volta, `Sheet` para formulário curto.
- Status de equipamento: `lib/equipment-status.ts` (Instalando · Operacional · Atenção · Erro);
  o cliente vê `lib/client-status.ts`.

## Avisos

- O backend grava os avisos em `notifications` e o app abre cada um pela chave `target`
  (`lib/notifications.ts` → `hrefForNotification`, por perfil). Destino novo: some a chave lá
  e em `packages/backend/convex/lib/notifications.ts`.
- O push ainda depende de `expo-notifications` e `expo-device` (não instalados): até lá os
  avisos ficam só no sino.

## Sem sinal

- Fila de registros de campo: `lib/offline-queue.ts`; fila de ponto: `lib/punch-queue.ts`;
  envio: `components/offline-sync.tsx`.
- Leitura com cópia no aparelho: `lib/use-cached-query.ts` (devolve também a hora da cópia).

## Verificação

```bash
pnpm -F native lint
pnpm -F native check-types
```
