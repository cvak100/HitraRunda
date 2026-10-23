import { describe, expect, it } from "vitest";

import { ApiError } from "./api";

describe("ApiError", () => {
  it("carries status and message", () => {
    const err = new ApiError(403, "Prijavi se.");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toBe("Prijavi se.");
  });
});
