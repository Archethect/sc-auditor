/**
 * MAP builder regression tests against fixture Solidity files.
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemMap } from "../../../src/core/map-builder.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "solidity");

describe("AC1: CallbackGrief.sol fixture", () => {
  it("artifact contains external_call_sites with the callback", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const callbackCalls = artifact.external_call_sites.filter(
      (site) => site.contract === "CallbackGrief",
    );
    expect(callbackCalls.length).toBeGreaterThan(0);
  });

  it("detects state write sites in CallbackGrief", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const writes = artifact.state_write_sites.filter(
      (site) => site.contract === "CallbackGrief",
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.some((w) => w.variable === "balances")).toBe(true);
  });
});

describe("AC2: SemanticDrift.sol fixture", () => {
  it("config_semantics contains entries for taxCut", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const taxCutEntries = artifact.config_semantics.filter(
      (cs) => cs.variable === "taxCut",
    );
    expect(taxCutEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("config_semantics flags conflict for taxCut across contracts", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const taxCutEntries = artifact.config_semantics.filter(
      (cs) => cs.variable === "taxCut",
    );

    const hasConflict = taxCutEntries.some(
      (cs) => cs.conflicts_with && cs.conflicts_with.length > 0,
    );
    expect(hasConflict).toBe(true);
  });
});

describe("AC3: EntitlementDrift.sol fixture", () => {
  it("state_write_sites show the ordering issue in deposit", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const depositWrites = artifact.state_write_sites.filter(
      (site) => site.contract === "EntitlementDrift" && site.function_name === "deposit",
    );
    expect(depositWrites.length).toBeGreaterThan(0);
    expect(depositWrites.some((w) => w.variable === "shares")).toBe(true);
    expect(depositWrites.some((w) => w.variable === "totalShares")).toBe(true);
  });

  it("derives totalShares/shares invariant for EntitlementDrift", async () => {
    const artifact = await buildSystemMap(FIXTURES_DIR);

    const invariant = artifact.protocol_invariants.find(
      (inv) => inv.description.includes("totalShares") && inv.description.includes("shares"),
    );
    expect(invariant).toBeDefined();
  });
});
