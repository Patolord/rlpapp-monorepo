import { describe, expect, it } from "vitest";
import {
  normalizeWeekdays,
  parseTimeOfDay,
  reminderTimeError,
  weekdaysLabel,
} from "../src/rh/timeClockReminders";

describe("lembretes do ponto", () => {
  it("lê HH:MM", () => {
    expect(parseTimeOfDay("08:05")).toBe(485);
    expect(parseTimeOfDay(" 18:00 ")).toBe(1080);
    expect(parseTimeOfDay("8:05")).toBeNull();
    expect(parseTimeOfDay("24:00")).toBeNull();
  });

  it("aceita só horários fora do silêncio noturno", () => {
    expect(reminderTimeError("06:00")).toBeNull();
    expect(reminderTimeError("20:59")).toBeNull();
    expect(reminderTimeError("05:59")).toMatch(/entre/);
    expect(reminderTimeError("21:00")).toMatch(/entre/);
    expect(reminderTimeError("abc")).toMatch(/HH:MM/);
  });

  it("normaliza e descreve os dias", () => {
    expect(normalizeWeekdays([5, 1, 1, 7, -1, 2.5])).toEqual([1, 5]);
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe("Seg a Sex");
    expect(weekdaysLabel([1, 3, 5])).toBe("Seg, Qua e Sex");
    expect(weekdaysLabel([6])).toBe("Sáb");
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos os dias");
    expect(weekdaysLabel([])).toBe("Nenhum dia");
  });
});
