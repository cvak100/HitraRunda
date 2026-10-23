import { describe, expect, it } from "vitest";

import { formatDuration, formatMode, formatPoints, MODE_LABELS, REASONS } from "./format";

describe("formatPoints", () => {
  it("formats with sl-SI grouping", () => {
    expect(formatPoints(1234)).toMatch(/1.?234/);
  });
});

describe("formatDuration", () => {
  it("handles null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("formats seconds under a minute", () => {
    expect(formatDuration(45000)).toBe("45 s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("2 min 5 s");
  });
});

describe("formatMode", () => {
  it("maps known modes", () => {
    expect(formatMode("dirka")).toBe(MODE_LABELS.dirka);
    expect(formatMode("multiplayer")).toBe("Hitra tekma");
  });

  it("falls back to raw mode", () => {
    expect(formatMode("custom_x")).toBe("custom_x");
  });
});

describe("REASONS", () => {
  it("has walk_away", () => {
    expect(REASONS.walk_away).toContain("Odnehal");
  });
});
