import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  applyRecordOverrides,
  defaultsOf,
  diffOverrides,
  diffRecordOverrides,
  originOf,
  sameList,
  sameRecord,
} from "./overrides";

type Row = { key: string; value: number };
const rules = {
  key: (r: Row) => r.key.toLowerCase(),
  same: (a: Row, b: Row) => a.key.toLowerCase() === b.key.toLowerCase() && a.value === b.value,
};
const row = (key: string, value: number): Row => ({ key, value });
const defaults = [row("a", 1), row("b", 2), row("c", 3)];

describe("list overrides", () => {
  it("falls back to the seeds until the company publishes anything", () => {
    const seeds = [row("s", 0)];
    expect(defaultsOf(null, seeds)).toBe(seeds);
    expect(defaultsOf([], seeds)).toBe(seeds);
    expect(defaultsOf(defaults, seeds)).toBe(defaults);
  });

  it("applies edits, removals and local entries in the defaults' order", () => {
    const mine = row("mine", 9);
    const editedA = row("A", 10);
    const list = applyOverrides(defaults, { overrides: [mine, editedA], removed: ["b"] }, rules);
    expect(list).toEqual([editedA, defaults[2], mine]);
  });

  it("keeps as overrides only what differs; the removed keys outlive a change of defaults", () => {
    const edited = row("b", 20);
    const mine = row("mine", 9);
    const first = diffOverrides(defaults, [defaults[0], edited, mine], rules);
    expect(first).toEqual({ overrides: [edited, mine], removed: ["c"] });
    expect(originOf(defaults, defaults[0], rules)).toBe("default");
    expect(originOf(defaults, row("A", 1), rules)).toBe("default");
    expect(originOf(defaults, edited, rules)).toBe("modified");
    expect(originOf(defaults, mine, rules)).toBe("local");
    // the company drops "c": the removal is remembered, so a later re-publish stays hidden
    const newer = [defaults[0], defaults[1], row("d", 4)];
    const second = diffOverrides(newer, applyOverrides(newer, first, rules), rules, first);
    expect(second.removed).toEqual(["c"]);
    expect(applyOverrides([...newer, defaults[2]], second, rules).map((r) => r.key)).toEqual([
      "a",
      "b",
      "d",
      "mine",
    ]);
    // brought back by the user: forgotten
    const third = diffOverrides(defaults, defaults, rules, second);
    expect(third).toEqual({ overrides: [], removed: [] });
  });

  it("sameList compares entry by entry", () => {
    expect(sameList(defaults, [...defaults], rules.same)).toBe(true);
    expect(sameList(defaults, defaults.slice(1), rules.same)).toBe(false);
    expect(sameList(defaults, [defaults[0], row("b", 5), defaults[2]], rules.same)).toBe(false);
  });
});

describe("record overrides", () => {
  it("layers the user's values over the defaults and keeps only what differs", () => {
    const defaults = { cobre: 120, chapa: 9 };
    expect(applyRecordOverrides(defaults, { cobre: 130 })).toEqual({ cobre: 130, chapa: 9 });
    expect(diffRecordOverrides(defaults, { cobre: 120, chapa: 10, x: 1 })).toEqual({
      chapa: 10,
      x: 1,
    });
    expect(sameRecord({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameRecord({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameRecord({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
