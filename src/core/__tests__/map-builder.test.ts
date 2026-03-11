/**
 * Tests for the MAP builder core module.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Finding } from "../../types/finding.js";
import { buildSystemMap } from "../map-builder.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-builder-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Creates a minimal Solidity file at the given path within tempDir.
 */
function writeSol(relPath: string, content: string): void {
  const fullPath = path.join(tempDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

/**
 * Creates a minimal test finding with sensible defaults.
 */
function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    title: overrides.title ?? "Test Finding",
    severity: overrides.severity ?? "MEDIUM",
    confidence: overrides.confidence ?? "Likely",
    source: overrides.source ?? "slither",
    category: overrides.category ?? "reentrancy",
    affected_files: overrides.affected_files ?? ["contracts/Vault.sol"],
    affected_lines: overrides.affected_lines ?? { start: 10, end: 20 },
    description: overrides.description ?? "Test description",
    detector_id: overrides.detector_id ?? "reentrancy-eth",
    evidence_sources: overrides.evidence_sources ?? [
      { type: "static_analysis", tool: "slither", detector_id: "reentrancy-eth" },
    ],
  };
}

describe("AC1: Empty/minimal directory produces valid artifact with empty arrays", () => {
  it("returns valid artifact with all 10 required fields for single empty contract", async () => {
    writeSol("Empty.sol", `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Empty {}\n`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact).toBeDefined();
    expect(artifact.components).toBeDefined();
    expect(artifact.external_surfaces).toBeDefined();
    expect(artifact.auth_surfaces).toBeDefined();
    expect(artifact.state_variables).toBeDefined();
    expect(artifact.state_write_sites).toBeDefined();
    expect(artifact.external_call_sites).toBeDefined();
    expect(artifact.value_flow_edges).toBeDefined();
    expect(artifact.config_semantics).toBeDefined();
    expect(artifact.protocol_invariants).toBeDefined();
    expect(artifact.static_summary).toBeDefined();
  });

  it("returns empty arrays for a contract with no functions or state", async () => {
    writeSol("Minimal.sol", `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Minimal {}\n`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.external_surfaces).toEqual([]);
    expect(artifact.auth_surfaces).toEqual([]);
    expect(artifact.state_variables).toEqual([]);
    expect(artifact.state_write_sites).toEqual([]);
    expect(artifact.external_call_sites).toEqual([]);
    expect(artifact.value_flow_edges).toEqual([]);
  });

  it("throws on non-absolute rootDir", async () => {
    await expect(buildSystemMap("relative/path")).rejects.toThrow("ERROR: INVALID_ROOT");
  });

  it("throws on directory with no .sol files", async () => {
    await expect(buildSystemMap(tempDir)).rejects.toThrow("ERROR: NO_SOLIDITY_FILES");
  });
});

describe("AC2: Multi-contract project populates all fields", () => {
  it("extracts components, functions, state variables from multiple contracts", async () => {
    writeSol("contracts/Vault.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalSupply += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
    }
}
`);

    writeSol("contracts/Token.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Token {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balances[to] += amount;
        totalSupply += amount;
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.components.length).toBeGreaterThanOrEqual(2);
    expect(artifact.components.map((c) => c.name)).toContain("Vault");
    expect(artifact.components.map((c) => c.name)).toContain("Token");

    expect(artifact.external_surfaces.length).toBeGreaterThanOrEqual(2);
    expect(artifact.state_variables.length).toBeGreaterThanOrEqual(2);
    expect(artifact.state_write_sites.length).toBeGreaterThan(0);
    expect(artifact.external_call_sites.length).toBeGreaterThan(0);
  });

  it("populates static_summary from provided findings", async () => {
    writeSol("A.sol", `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A {}\n`);

    const findings: Finding[] = [
      createFinding({ source: "slither", severity: "HIGH", category: "reentrancy" }),
      createFinding({ source: "aderyn", severity: "MEDIUM", category: "access_control" }),
    ];

    const artifact = await buildSystemMap(tempDir, findings);

    expect(artifact.static_summary.slither_finding_count).toBe(1);
    expect(artifact.static_summary.aderyn_finding_count).toBe(1);
    expect(artifact.static_summary.highest_severity).toBe("HIGH");
    expect(artifact.static_summary.categories_detected).toContain("reentrancy");
    expect(artifact.static_summary.categories_detected).toContain("access_control");
  });
});

describe("AC3: Deterministic output for same input", () => {
  it("produces identical artifacts on repeated calls", async () => {
    writeSol("contracts/A.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Alpha {
    uint256 public value;
    function setValue(uint256 v) external { value = v; }
}
`);
    writeSol("contracts/B.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Beta {
    uint256 public count;
    function increment() external { count += 1; }
}
`);

    const artifact1 = await buildSystemMap(tempDir);
    const artifact2 = await buildSystemMap(tempDir);

    expect(JSON.stringify(artifact1)).toBe(JSON.stringify(artifact2));
  });
});

describe("AC4: Auth surfaces detected", () => {
  it("detects onlyOwner modifier as auth surface", async () => {
    writeSol("Owned.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Owned {
    address public owner;
    function setFee(uint256 fee) external onlyOwner {
        // set fee
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.auth_surfaces.length).toBeGreaterThan(0);
    expect(artifact.auth_surfaces[0].modifier).toBe("onlyOwner");
    expect(artifact.auth_surfaces[0].role).toBe("owner");
  });
});

describe("AC5: External call sites detected", () => {
  it("detects .call{ pattern as external call site", async () => {
    writeSol("Caller.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Caller {
    mapping(address => uint256) public balances;
    function sendEth(address to, uint256 amt) external {
        (bool ok, ) = to.call{value: amt}("");
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.external_call_sites.length).toBeGreaterThan(0);
    expect(artifact.external_call_sites[0].call_type).toBe("call");
    expect(artifact.external_call_sites[0].value_sent).toBe(true);
  });
});

describe("AC6: Value flow edges detected", () => {
  it("detects .transfer pattern as value flow edge", async () => {
    writeSol("Sender.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address, uint256) external returns (bool);
}

contract Sender {
    address public token;
    function send(address to, uint256 amt) external {
        IERC20(token).transfer(to, amt);
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    // The interface itself declares functions but the call inside Sender is what we care about
    expect(artifact.value_flow_edges.length).toBeGreaterThan(0);
  });
});

describe("AC7: Protocol invariants derived", () => {
  it("derives balance/totalSupply invariant when both exist", async () => {
    writeSol("Pool.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Pool {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalSupply += msg.value;
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    const balanceInvariant = artifact.protocol_invariants.find(
      (inv) => inv.description.includes("totalSupply") && inv.description.includes("balances"),
    );
    expect(balanceInvariant).toBeDefined();
  });
});

describe("AC8: Contracts with complex modifiers", () => {
  it("extracts multiple modifiers on one function", async () => {
    writeSol("MultiMod.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MultiMod {
    uint256 public value;
    function protectedAction(uint256 v) external onlyOwner nonReentrant {
        value = v;
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.auth_surfaces.length).toBeGreaterThanOrEqual(2);
    const modifiers = artifact.auth_surfaces
      .filter((a) => a.function_name === "protectedAction")
      .map((a) => a.modifier);
    expect(modifiers).toContain("onlyOwner");
    expect(modifiers).toContain("nonReentrant");
  });
});

describe("AC9: Interface-only files", () => {
  it("parses interface files without state variables", async () => {
    writeSol("IToken.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.components.some((c) => c.name === "IToken")).toBe(true);
    expect(artifact.state_variables.filter((v) => v.contract === "IToken")).toHaveLength(0);
  });
});

describe("AC10: Library files with internal functions", () => {
  it("parses library with internal functions", async () => {
    writeSol("SafeMath.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.components.some((c) => c.name === "SafeMath")).toBe(true);
    // Internal functions should NOT appear in external surfaces
    expect(artifact.external_surfaces.filter((f) => f.contract === "SafeMath")).toHaveLength(0);
  });
});

describe("AC11: Files with assembly blocks", () => {
  it("handles files containing assembly blocks without errors", async () => {
    writeSol("Assembly.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Assembly {
    uint256 public result;
    function useAssembly(uint256 x) external {
        assembly {
            let y := add(x, 1)
            sstore(0, y)
        }
        result = x;
    }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.components.some((c) => c.name === "Assembly")).toBe(true);
    expect(artifact.external_surfaces.some((f) => f.name === "useAssembly")).toBe(true);
  });
});

describe("AC12: Multiple contracts in one file", () => {
  it("detects both contracts from a single file", async () => {
    writeSol("Multi.sol", `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract First {
    uint256 public a;
    function setA(uint256 v) external { a = v; }
}

contract Second {
    uint256 public b;
    function setB(uint256 v) external { b = v; }
}
`);

    const artifact = await buildSystemMap(tempDir);

    expect(artifact.components.some((c) => c.name === "First")).toBe(true);
    expect(artifact.components.some((c) => c.name === "Second")).toBe(true);
    expect(artifact.external_surfaces.some((f) => f.contract === "First" && f.name === "setA")).toBe(true);
    expect(artifact.external_surfaces.some((f) => f.contract === "Second" && f.name === "setB")).toBe(true);
  });
});
