import { describe, expect, it } from "vitest";

describe("AC6: loadConfig is exported from src/config/", () => {
  it("loadConfig is exported from config index", async () => {
    const configModule = await import("../index.js");
    expect(typeof configModule.loadConfig).toBe("function");
  });

  it("loadConfig is exported from the top-level package index", async () => {
    const rootModule = await import("../../index.js");
    expect(typeof rootModule.loadConfig).toBe("function");
  });
});
