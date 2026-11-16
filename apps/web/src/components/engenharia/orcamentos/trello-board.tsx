import type { api } from "@rlpapp/backend/convex/_generated/api";
import { formatDate } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { ChevronRight, ExternalLink } from "lucide-react";

import { parseOrcamentoName, stageLabel } from "@/lib/engenharia/orcamento-name";
import { cn } from "@/lib/utils";

export type TrelloBoardData = FunctionReturnType<typeof api.sharepoint.trelloBoard>;
type Column = TrelloBoardData["columns"][number];
type Group = Column["groups"][number];
type CardData = Group["cards"][number];

/** Cor do marcador de cada coluna, pelo começo do nome da etapa. */
function columnAccent(name: string): string {
  const key = name.toLocaleLowerCase("pt-BR");
  if (key.startsWith("para fazer")) return "bg-amber-500";
  if (key.startsWith("em andamento")) return "bg-sky-500";
  return "bg-slate-400";
}

/** Colunas do quadro (Para Fazer e Em Andamento), lado a lado. */
export function TrelloBoard({ columns }: { columns: Column[] }) {
  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        As pastas Para Fazer e Em Andamento não foram encontradas na TRELLO.
      </p>
    );
  }
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {columns.map((column) => (
        <BoardColumn key={column.name} column={column} />
      ))}
    </div>
  );
}

function BoardColumn({ column }: { column: Column }) {
  return (
    <section className="rounded-lg border border-slate-200/70 bg-slate-100/70 p-3">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", columnAccent(column.name))} aria-hidden />
        <h2 className="text-sm font-semibold">{column.name}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {column.count}
        </span>
        {column.webUrl && (
          <a
            href={column.webUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-muted-foreground hover:text-foreground"
            title={`Abrir ${column.name} no SharePoint`}
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </header>
      <div className="space-y-3">
        {column.groups.map((group) =>
          group.name === null ? (
            <CardList key="direct" cards={group.cards} />
          ) : (
            <BoardGroup key={group.name} group={group} />
          )
        )}
        {column.count === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nenhum orçamento aqui.</p>
        )}
      </div>
    </section>
  );
}

/** Subpasta de uma etapa (ex.: 2026, Ultrapassados); as antigas começam recolhidas. */
function BoardGroup({ group }: { group: Group }) {
  return (
    <details open={!group.stale} className="group/details">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-1 py-1 text-xs font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open/details:rotate-90" />
        <span>{group.name}</span>
        <span className="tabular-nums">· {group.cards.length}</span>
      </summary>
      <div className="mt-2">
        {group.cards.length > 0 ? (
          <CardList cards={group.cards} />
        ) : (
          <p className="px-1 text-xs text-muted-foreground">Vazio.</p>
        )}
      </div>
    </details>
  );
}

function CardList({ cards }: { cards: CardData[] }) {
  return (
    <ul className="space-y-2">
      {cards.map((card) => (
        <li key={card.name}>
          <OrcamentoCard card={card} />
        </li>
      ))}
    </ul>
  );
}

function OrcamentoCard({ card }: { card: CardData }) {
  const { code, title, subtitle } = parseOrcamentoName(card.name);
  const body = (
    <>
      {code && <p className="font-mono text-[11px] text-muted-foreground">{code}</p>}
      <p className="text-sm font-medium leading-snug">{title}</p>
      {subtitle && <p className="text-sm leading-snug text-muted-foreground">{subtitle}</p>}
      {card.modifiedAt && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Alterado em {formatDate(card.modifiedAt)}
        </p>
      )}
    </>
  );
  const className =
    "block rounded-md border border-slate-200 bg-white p-3 shadow-xs transition-colors";
  return card.webUrl ? (
    <a
      href={card.webUrl}
      target="_blank"
      rel="noreferrer"
      title={card.name}
      className={cn(className, "hover:border-slate-300 hover:bg-slate-50")}
    >
      {body}
    </a>
  ) : (
    <div title={card.name} className={className}>
      {body}
    </div>
  );
}

/** Etapas sem destaque (Concluído, Obsoletos): só a contagem, numa linha discreta. */
export function OtherStages({ stages }: { stages: TrelloBoardData["others"] }) {
  if (stages.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {stages.map((stage) => {
        const label = (
          <>
            {stageLabel(stage.name)} <span className="tabular-nums">{stage.count}</span>
          </>
        );
        return stage.webUrl ? (
          <a
            key={stage.name}
            href={stage.webUrl}
            target="_blank"
            rel="noreferrer"
            title={stage.name}
            className="hover:text-foreground hover:underline"
          >
            {label}
          </a>
        ) : (
          <span key={stage.name} title={stage.name}>
            {label}
          </span>
        );
      })}
    </p>
  );
}
