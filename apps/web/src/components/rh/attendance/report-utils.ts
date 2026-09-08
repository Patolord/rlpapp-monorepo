import { formatDate } from "./format";

export interface AttendanceReportData {
  totalManDays: number;
  totalCostCents: number;
  dailyRateCents: number;
  employees: { key: string; employeeId: string | null; name: string; days: number }[];
  worksites: { key: string; projectId: string | null; name: string; days: number }[];
  days: { date: string; coverage: string; status: string; lastSuccessAt: number | null; provisional: boolean }[];
  truncated: boolean;
}

export function validReportRange(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && new Date(start).toISOString().slice(0, 10) === startDate && new Date(end).toISOString().slice(0, 10) === endDate && end >= start && end - start <= 89 * 86_400_000;
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}

export function reportCsv(data: AttendanceReportData, startDate: string, endDate: string, group: "employees" | "worksites") {
  const items = group === "employees" ? data.employees : data.worksites;
  const rows: (string | number)[][] = [
    ["Fonte", "Marcações mobile do RHiD; cobertura não verificada"],
    ["Período", `${formatDate(startDate)} a ${formatDate(endDate)}`],
    ["Observação", "Estimativa operacional. Não representa folha de pagamento ou confirmação de presença."],
    ["Dias sem sincronização bem-sucedida", data.days.filter((day) => day.status !== "ready").length],
    ["Dados provisórios", data.days.some((day) => day.provisional) ? "Sim" : "Não"],
    ["Distribuição incompleta", data.truncated ? "Sim" : "Não"],
    ["Diária de referência (BRL)", (data.dailyRateCents / 100).toFixed(2)],
    [group === "employees" ? "Funcionário" : "Obra", "Dias-pessoa com marcação", "Custo estimado (BRL)"],
    ...items.map((item) => [item.name, item.days, (item.days * data.dailyRateCents / 100).toFixed(2)]),
  ];
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
