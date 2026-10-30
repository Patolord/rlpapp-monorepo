import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { LoadingState, Pill, SectionTitle, Surface } from "@/components/ui";
import { colors, radius, space, type, type Tone } from "@/lib/theme";

import { FRESHNESS, PRICE_SOURCE } from "./labels";

type PriceHistory = FunctionReturnType<typeof api.priceEvents.historyForMaterial>;
type PricePoint = PriceHistory["points"][number];
type PriceChange = NonNullable<PricePoint["change"]>;

const RECENT_LIMIT = 5;

/** "+5,2%" ou, sem base percentual, "+R$ 0,50". */
export function formatPriceChange(change: PriceChange): string {
  const sign = change.deltaCents > 0 ? "+" : change.deltaCents < 0 ? "−" : "";
  if (change.deltaPercent === null) return `${sign}${formatCurrency(Math.abs(change.deltaCents))}`;
  return `${sign}${Math.abs(change.deltaPercent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function changeTone(change: PriceChange): Tone {
  if (change.deltaCents > 0) return "danger";
  if (change.deltaCents < 0) return "success";
  return "neutral";
}

/** Variação para quem compra: subida em vermelho, queda em verde. */
export function PriceChangePill({ change }: { change: PriceChange | null }) {
  if (!change) return null;
  const tone = changeTone(change);
  const Icon = change.deltaCents > 0 ? ArrowUpRight : change.deltaCents < 0 ? ArrowDownRight : Minus;
  const color = tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.textSecondary;
  return <Pill label={formatPriceChange(change)} tone={tone} icon={<Icon size={12} color={color} strokeWidth={2.4} />} />;
}

/** Histórico de preços do material: resumo, linha do tempo, por fornecedor e registros. */
export function MaterialPriceHistory({ materialId }: { materialId: Id<"materials"> }) {
  const [now] = useState(() => Date.now());
  const history = useQuery(api.priceEvents.historyForMaterial, { materialId, now });
  const [showAll, setShowAll] = useState(false);

  return (
    <View>
      <SectionTitle title="Preços" style={styles.section} />
      {history === undefined ? (
        <LoadingState style={{ flex: 0, paddingVertical: space.lg }} />
      ) : !history.current || !history.summary ? (
        <Surface style={{ alignItems: "center", paddingVertical: space.lg }}>
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            Nenhum preço registrado{history.excludedCount > 0 ? ` na unidade ${history.unit ?? "do material"}` : ""}.
          </Text>
        </Surface>
      ) : (
        <HistoryBody history={history} showAll={showAll} onToggleShowAll={() => setShowAll((value) => !value)} />
      )}
    </View>
  );
}

function HistoryBody({ history, showAll, onToggleShowAll }: { history: PriceHistory; showAll: boolean; onToggleShowAll: () => void }) {
  const current = history.current!;
  const summary = history.summary!;
  const recent = [...history.points].reverse();
  const visible = showAll ? recent : recent.slice(0, RECENT_LIMIT);

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.tiles}>
        <View style={[styles.tile, { flexBasis: "100%" }]}>
          <Text style={styles.tileLabel}>Atual</Text>
          <View style={styles.tileRow}>
            <Text style={[type.title, { color: colors.text }]}>
              {formatCurrency(current.unitPriceCents)}
              {history.unit ? <Text style={[type.caption, { color: colors.textMuted }]}>/{history.unit}</Text> : null}
            </Text>
            <Pill label={FRESHNESS[current.freshness]?.label ?? current.freshness} tone={FRESHNESS[current.freshness]?.tone ?? "neutral"} />
          </View>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {current.supplierName} · {formatDate(current.occurredAt)}
          </Text>
        </View>
        <ChangeTile label="vs. anterior" hint="mesmo fornecedor" change={summary.changeFromPrevious} />
        <ChangeTile label="30 dias" change={summary.change30d} />
        <ChangeTile label="90 dias" change={summary.change90d} />
      </View>

      {history.points.length > 1 ? <PriceSparkline points={history.points} /> : null}

      <Text style={[type.caption, { color: colors.textMuted, marginHorizontal: 4 }]}>
        {summary.count} {summary.count === 1 ? "preço" : "preços"} de {formatDate(summary.firstAt)} a {formatDate(summary.lastAt)} · mín. {formatCurrency(summary.minCents)} · máx.{" "}
        {formatCurrency(summary.maxCents)}
        {history.excludedCount > 0 ? ` · ${history.excludedCount} em outra unidade fora da série` : ""}
      </Text>

      {history.suppliers.length > 0 ? (
        <View>
          <Text style={styles.subheading}>Último preço por fornecedor</Text>
          <Surface padded={false}>
            {history.suppliers.map((supplier, index) => (
              <View key={supplier.supplierId ?? supplier.supplierName} style={[styles.row, index > 0 && styles.rowBorder]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                    {supplier.supplierName}
                  </Text>
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    {formatDate(supplier.occurredAt)} · {PRICE_SOURCE[supplier.source] ?? supplier.source} · {supplier.count} {supplier.count === 1 ? "registro" : "registros"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[type.bodyStrong, { color: colors.text }]}>
                    {formatCurrency(supplier.unitPriceCents)}
                    {supplier.unit ? <Text style={[type.caption, { color: colors.textMuted }]}>/{supplier.unit}</Text> : null}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Pill label={FRESHNESS[supplier.freshness]?.label ?? supplier.freshness} tone={FRESHNESS[supplier.freshness]?.tone ?? "neutral"} />
                    <PriceChangePill change={supplier.change} />
                  </View>
                </View>
              </View>
            ))}
          </Surface>
        </View>
      ) : null}

      <View>
        <Text style={styles.subheading}>Registros</Text>
        <Surface padded={false}>
          {visible.map((point, index) => (
            <View key={point._id} style={[styles.row, index > 0 && styles.rowBorder]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodySm, { color: colors.text }]} numberOfLines={1}>
                  {formatDate(point.occurredAt)} · {point.supplierName}
                </Text>
                <Text style={[type.caption, { color: colors.textMuted }]}>
                  {PRICE_SOURCE[point.source] ?? point.source}
                  {point.needsReview ? " · precisa revisão" : ""}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <PriceChangePill change={point.change} />
                <Text style={[type.bodyStrong, { color: colors.text }]}>{formatCurrency(point.unitPriceCents)}</Text>
              </View>
            </View>
          ))}
          {recent.length > RECENT_LIMIT ? (
            <Pressable onPress={onToggleShowAll} style={[styles.row, styles.rowBorder, { justifyContent: "center" }]} accessibilityRole="button">
              <Text style={[type.label, { color: colors.primary }]}>{showAll ? "Mostrar menos" : `Ver todos (${recent.length})`}</Text>
            </Pressable>
          ) : null}
        </Surface>
      </View>
    </View>
  );
}

function ChangeTile({ label, hint, change }: { label: string; hint?: string; change: PriceChange | null }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      {change ? (
        <>
          <PriceChangePill change={change} />
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            de {formatCurrency(change.fromCents)}
          </Text>
        </>
      ) : (
        <>
          <Text style={[type.bodySm, { color: colors.textMuted }]}>—</Text>
          <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
            sem base
          </Text>
        </>
      )}
      {hint ? (
        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 72;
const PAD_X = 6;
const PAD_Y = 8;

/** Linha do tempo dos preços comparáveis; o eixo X é o tempo real. */
function PriceSparkline({ points }: { points: PricePoint[] }) {
  const minAt = points[0]!.occurredAt;
  const maxAt = points[points.length - 1]!.occurredAt;
  const prices = points.map((point) => point.unitPriceCents);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spanAt = Math.max(maxAt - minAt, 1);
  const spanPrice = Math.max(maxPrice - minPrice, 1);

  const coords = points.map((point) => ({
    point,
    x: PAD_X + ((point.occurredAt - minAt) / spanAt) * (CHART_WIDTH - 2 * PAD_X),
    y: PAD_Y + (1 - (point.unitPriceCents - minPrice) / spanPrice) * (CHART_HEIGHT - 2 * PAD_Y),
  }));
  const path = coords.map((c, index) => `${index === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <Surface>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
        <Path d={path} fill="none" stroke={colors.primary} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map(({ point, x, y }) => (
          <Circle key={point._id} cx={x} cy={y} r={3} fill={colors.primary} opacity={point.needsReview ? 0.5 : 1} />
        ))}
      </Svg>
      <View style={styles.axis}>
        <Text style={[type.caption, { color: colors.textMuted }]}>{formatDate(minAt)}</Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          {formatCurrency(minPrice)} – {formatCurrency(maxPrice)}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>{formatDate(maxAt)}</Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 4, paddingTop: 0, paddingBottom: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    gap: 4,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  tileLabel: { ...type.caption, color: colors.textMuted, textTransform: "uppercase" },
  tileRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  subheading: { ...type.caption, color: colors.textMuted, marginBottom: space.xs, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: space.xs },
});
