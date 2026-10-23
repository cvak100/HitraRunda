import { describe, expect, it } from "vitest";

import { GAME_MODES } from "./gameModes";

describe("GAME_MODES", () => {
  it("exposes five playable modes with play and board routes", () => {
    expect(GAME_MODES).toHaveLength(5);
    for (const mode of GAME_MODES) {
      expect(mode.id).toBeTruthy();
      expect(mode.playTo.startsWith("/igra/")).toBe(true);
      expect(mode.boardTo.startsWith("/lestvica/")).toBe(true);
    }
  });

  it("includes lobby modes multiplayer and dirka", () => {
    const ids = GAME_MODES.map((m) => m.id);
    expect(ids).toContain("multiplayer");
    expect(ids).toContain("dirka");
  });
});
