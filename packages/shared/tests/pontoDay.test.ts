import { describe, expect, test } from "vitest";
import {
  classifyDay,
  DEFAULT_WORK_SCHEDULE,
  describeWorkSchedule,
  parseClockLabel,
  planNextPunch,
  workScheduleError,
  type DayItemInput,
  type PunchRole,
} from "../src/rh/pontoDay";

const schedule = DEFAULT_WORK_SCHEDULE; // 07:00–17:00, almoço 1 h entre 11:00 e 14:00

const at = (label: string) => parseClockLabel(label)!;

function punches(...labels: string[]): DayItemInput[] {
  return labels.map((label, index) => ({ id: `p${index}`, minute: at(label), source: "punch" }));
}

function roles(items: DayItemInput[], open = false): PunchRole[] {
  return classifyDay({ items, schedule, open }).items.map((item) => item.role);
}

describe("classifyDay", () => {
  test("dia normal: quatro marcações", () => {
    const day = classifyDay({ items: punches("07:02", "12:01", "13:00", "17:05"), schedule, open: false });
    expect(day.items.map((i) => i.role)).toEqual(["entrada", "almoco_saida", "almoco_retorno", "saida"]);
    expect(day.issues).toEqual([]);
    expect(day.status).toBe("left");
  });

  test("esquecer a volta do almoço não empurra a saída", () => {
    const day = classifyDay({ items: punches("07:02", "12:05", "17:10"), schedule, open: false });
    expect(day.slots.saida?.minute).toBe(at("17:10"));
    expect(day.slots.entrada?.minute).toBe(at("07:02"));
    expect(day.issues.map((i) => i.code)).toEqual(["missing"]);
  });

  test("esquecer a entrada", () => {
    expect(roles(punches("12:00", "13:00", "17:00"))).toEqual(["almoco_saida", "almoco_retorno", "saida"]);
  });

  test("sem almoço registrado", () => {
    const day = classifyDay({ items: punches("07:00", "17:00"), schedule, open: false });
    expect(day.items.map((i) => i.role)).toEqual(["entrada", "saida"]);
    expect(day.issues.map((i) => i.code)).toEqual(["no_lunch"]);
  });

  test("toque repetido vira 'repetida' e não ocupa lugar", () => {
    expect(roles(punches("07:00", "07:02", "12:00", "13:00", "17:00"))).toEqual([
      "entrada",
      "repetida",
      "almoco_saida",
      "almoco_retorno",
      "saida",
    ]);
  });

  test("hora extra depois da saída", () => {
    const day = classifyDay({
      items: punches("07:00", "12:00", "13:00", "17:00", "20:00", "22:00"),
      schedule,
      open: false,
    });
    expect(day.items.map((i) => i.role)).toEqual([
      "entrada",
      "almoco_saida",
      "almoco_retorno",
      "saida",
      "entrada_extra",
      "saida_extra",
    ]);
    // Ninguém explicou o par a mais: o RH olha (uma pendência por par).
    expect(day.issues.filter((i) => i.code === "extra")).toHaveLength(1);
    expect(day.status).toBe("left");
  });

  test("saída tarde sem marcações a mais continua sendo a saída", () => {
    expect(roles(punches("07:00", "12:00", "13:00", "21:30"))).toEqual([
      "entrada",
      "almoco_saida",
      "almoco_retorno",
      "saida",
    ]);
  });

  test("saída rápida informada no app não vira almoço", () => {
    const items: DayItemInput[] = [
      { id: "a", minute: at("07:00"), source: "punch" },
      { id: "b", minute: at("08:00"), source: "punch", role: "saida_extra", basis: "employee" },
      { id: "c", minute: at("08:40"), source: "punch" },
      { id: "d", minute: at("12:00"), source: "punch" },
      { id: "e", minute: at("13:00"), source: "punch" },
      { id: "f", minute: at("17:00"), source: "punch" },
    ];
    const day = classifyDay({ items, schedule, open: false });
    expect(day.items.map((i) => i.role)).toEqual([
      "entrada",
      "saida_extra",
      "entrada_extra",
      "almoco_saida",
      "almoco_retorno",
      "saida",
    ]);
  });

  test("dia aberto só cobra o que já passou", () => {
    const open = classifyDay({ items: punches("07:00", "12:00"), schedule, open: true });
    expect(open.issues).toEqual([]);
    expect(open.status).toBe("lunch");
    const closed = classifyDay({ items: punches("07:00", "12:00"), schedule, open: false });
    expect(closed.issues.map((i) => i.slot)).toEqual(["almoco_retorno", "saida"]);
  });

  test("horário informado pela pessoa preenche o lugar e fica pendente", () => {
    const items: DayItemInput[] = [
      ...punches("07:00", "12:00", "17:00"),
      { id: "r", minute: at("13:00"), source: "request", role: "almoco_retorno", basis: "pending" },
    ];
    const day = classifyDay({ items, schedule, open: false });
    expect(day.slots.almoco_retorno?.id).toBe("r");
    expect(day.issues.map((i) => i.code)).toEqual(["pending_request"]);
  });

  test("tratamento do RH prevalece e marcação desconsiderada fica de fora", () => {
    const items: DayItemInput[] = [
      { id: "a", minute: at("07:00"), source: "punch" },
      { id: "b", minute: at("07:30"), source: "punch", role: "desconsiderada", basis: "rh" },
      { id: "c", minute: at("12:00"), source: "punch", role: "almoco_retorno", basis: "rh" },
      { id: "d", minute: at("17:00"), source: "punch" },
    ];
    const day = classifyDay({ items, schedule, open: false });
    expect(day.items.map((i) => i.role)).toEqual(["entrada", "desconsiderada", "almoco_retorno", "saida"]);
    expect(day.issues.map((i) => i.slot)).toEqual(["almoco_saida"]);
  });

  test("almoço curto é só aviso", () => {
    const day = classifyDay({ items: punches("07:00", "12:00", "12:30", "17:00"), schedule, open: false });
    expect(day.issues).toEqual([expect.objectContaining({ code: "short_lunch", severity: "info" })]);
  });
});

describe("planNextPunch", () => {
  const plan = (labels: string[], now: string, extra: DayItemInput[] = []) =>
    planNextPunch({ items: [...punches(...labels), ...extra], schedule, nowMinute: at(now) });

  test("caminho normal: o botão diz o que vai registrar e não pergunta nada", () => {
    expect(plan([], "07:01")).toMatchObject({ role: "entrada", actionLabel: "Registrar entrada", prompt: null });
    expect(plan(["07:01"], "12:10")).toMatchObject({ role: "almoco_saida", prompt: null });
    expect(plan(["07:01", "12:10"], "13:05")).toMatchObject({ role: "almoco_retorno", prompt: null });
    expect(plan(["07:01", "12:10", "13:05"], "17:02")).toMatchObject({ role: "saida", prompt: null });
  });

  test("chegou atrasado: ainda é a entrada", () => {
    expect(plan([], "09:30")).toMatchObject({ role: "entrada", prompt: null });
  });

  test("esqueceu a volta do almoço: pergunta e sugere o horário", () => {
    const result = plan(["07:00", "12:05"], "17:10");
    expect(result.role).toBe("saida");
    expect(result.prompt?.title).toBe("Faltou registrar a volta do almoço");
    expect(result.prompt?.missed).toEqual([{ slot: "almoco_retorno", minute: at("13:05") }]);
    expect(result.prompt?.options[0]).toMatchObject({ declaredRole: "saida", missed: result.prompt?.missed });
  });

  test("esqueceu o almoço inteiro", () => {
    const result = plan(["07:00"], "17:00");
    expect(result.prompt?.title).toBe("Faltou registrar o almoço");
    expect(result.prompt?.missed).toEqual([
      { slot: "almoco_saida", minute: at("12:00") },
      { slot: "almoco_retorno", minute: at("13:00") },
    ]);
    expect(result.prompt?.options.map((o) => o.key)).toEqual(["forgot", "skip"]);
  });

  test("esqueceu a entrada: oferece 'estou chegando agora'", () => {
    const result = plan([], "12:15");
    expect(result.role).not.toBe("entrada");
    expect(result.prompt?.missed[0]).toEqual({ slot: "entrada", minute: at("07:00") });
    expect(result.prompt?.options.find((o) => o.key === "now")).toMatchObject({
      declaredRole: "entrada",
      missed: [],
    });
  });

  test("toque repetido pergunta e deixa cancelar", () => {
    const result = plan(["07:00"], "07:02");
    expect(result.role).toBe("repetida");
    expect(result.prompt?.options[0]).toMatchObject({ cancel: true });
  });

  test("depois da saída pergunta se voltou a trabalhar", () => {
    const result = plan(["07:00", "12:00", "13:00", "17:00"], "19:00");
    expect(result.prompt?.title).toBe("Você já registrou a saída às 17:00");
    expect(result.prompt?.options[0]).toMatchObject({ declaredRole: "entrada_extra" });
  });

  test("saída bem antes do fim pergunta se encerra o dia", () => {
    const result = plan(["07:00", "12:00", "13:00"], "15:00");
    expect(result.role).toBe("saida");
    expect(result.prompt?.options.map((o) => o.declaredRole)).toEqual(["saida", "saida_extra"]);
  });

  test("saída cedo de manhã pergunta se é almoço", () => {
    const result = plan(["07:00"], "09:00");
    expect(result.role).toBe("almoco_saida");
    expect(result.prompt?.options.map((o) => o.declaredRole)).toEqual(["almoco_saida", "saida_extra"]);
  });

  test("volta de uma saída rápida não pergunta", () => {
    const result = planNextPunch({
      items: [
        { id: "a", minute: at("07:00"), source: "punch", role: "entrada", basis: "auto" },
        { id: "b", minute: at("09:00"), source: "punch", role: "saida_extra", basis: "employee" },
      ],
      schedule,
      nowMinute: at("09:40"),
    });
    expect(result).toMatchObject({ role: "entrada_extra", actionLabel: "Registrar volta", prompt: null });
  });
});

describe("jornada", () => {
  test("valida e descreve", () => {
    expect(workScheduleError(schedule)).toBeNull();
    expect(workScheduleError({ ...schedule, endMinute: schedule.startMinute })).toMatch(/saída/);
    expect(workScheduleError({ ...schedule, lunchWindowEndMinute: at("11:30") })).toMatch(/faixa/);
    expect(describeWorkSchedule(schedule)).toBe("07:00 às 17:00 · almoço 1 h entre 11:00 e 14:00");
  });

  test("lê horários digitados", () => {
    expect(parseClockLabel("7")).toBe(420);
    expect(parseClockLabel("07:05")).toBe(425);
    expect(parseClockLabel("25:00")).toBeNull();
  });
});
