import { api } from "@rlpapp/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";

export type Overview = FunctionReturnType<typeof api.dashboard.getDirectorOverview>;

export const cardCls = "rounded-xl border border-slate-100 bg-white shadow-sm";
export const eyebrowCls =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

export function DashboardCardTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className={eyebrowCls}>{title}</h2>
      {action}
    </div>
  );
}

export function ViewAllLink({ label = "Ver todas" }: { label?: string }) {
  return (
    <Link
      to="/engenharia/obras"
      className="text-sm font-medium text-primary hover:underline"
    >
      {label}
    </Link>
  );
}
