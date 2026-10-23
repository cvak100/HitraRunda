import { describe, expect, it } from "vitest";

import { GAME_MODES, boardPath, playPath } from "./gameModes";

describe("GAME_MODES", () => {
  it("exposes five playable modes with play and board routes", () => {
    expect(GAME_MODES).toHaveLength(5);
    for (const mode of GAME_MODES) {
      expect(mode.id).toBeTruthy();
      expect(mode.playTo.startsWith("/igra/")).toBe(true);
      expect(mode.boardTo.startsWith("/lestvica/")).toBe(true);
      expect(mode.rules.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("includes lobby modes multiplayer and dirka", () => {
    const ids = GAME_MODES.map((m) => m.id);
    expect(ids).toContain("multiplayer");
    expect(ids).toContain("dirka");
  });
});

describe("boardPath / playPath", () => {
  it("resolves each mode from GAME_MODES", () => {
    for (const mode of GAME_MODES) {
      expect(boardPath(mode.id)).toBe(mode.boardTo);
      expect(playPath(mode.id)).toBe(mode.playTo);
    }
  });

  it("maps legacy millionaire to hitrarunda board", () => {
    expect(boardPath("millionaire")).toBe("/lestvica/hitrarunda");
    expect(playPath("millionaire")).toBe("/igra/hitrarunda");
  });

  it("falls back safely for unknown mode", () => {
    expect(boardPath("neznano")).toBe("/lestvica/hitrarunda");
    expect(playPath("neznano")).toBe("/igra");
  });
});
