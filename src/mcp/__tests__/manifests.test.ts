import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Project root resolved from this test file location. */
const ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Read and parse a JSON file relative to project root. */
function readJson(relativePath: string): unknown {
  const raw = readFileSync(resolve(ROOT, relativePath), "utf-8");
  return JSON.parse(raw);
}

/** Read a text file relative to project root. */
function readText(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

/** Canonical version from package.json used as the single source of truth. */
const PKG = readJson("package.json") as Record<string, unknown>;
const PKG_VERSION = PKG.version as string;

describe("AC1: .claude-plugin/plugin.json", () => {
  const plugin = readJson(".claude-plugin/plugin.json") as Record<string, unknown>;

  it('has name "sc-auditor"', () => {
    expect(plugin.name).toBe("sc-auditor");
  });

  it("has version matching package.json", () => {
    expect(plugin.version).toBe(PKG_VERSION);
  });
});

describe("AC2: .claude-plugin/marketplace.json", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json") as {
    metadata: { description: string };
    plugins: { version: string; description: string }[];
  };

  it("has plugins array with at least one entry", () => {
    expect(marketplace.plugins).toBeInstanceOf(Array);
    expect(marketplace.plugins.length).toBeGreaterThanOrEqual(1);
  });

  it("plugins[0].version matches package.json", () => {
    expect(marketplace.plugins[0].version).toBe(PKG_VERSION);
  });

  it("descriptions mention static analysis", () => {
    expect(marketplace.metadata.description).toContain("static analysis");
    expect(marketplace.plugins[0].description).toContain("static analysis");
  });
});

/** Expected MCP server entry point path using CLAUDE_PLUGIN_ROOT variable. */
const MCP_SERVER_ARG =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin root variable reference
  "${CLAUDE_PLUGIN_ROOT}/dist/mcp/main.js";

describe("AC3: .mcp.json", () => {
  const mcp = readJson(".mcp.json") as {
    mcpServers: {
      "sc-auditor": {
        type: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
      };
    };
  };
  const entry = mcp.mcpServers["sc-auditor"];

  it("references CLAUDE_PLUGIN_ROOT/dist/mcp/main.js in args", () => {
    expect(entry.args).toContain(MCP_SERVER_ARG);
  });

  it('has type "stdio" and command "node"', () => {
    expect(entry.type).toBe("stdio");
    expect(entry.command).toBe("node");
  });

  it("has an env block", () => {
    expect(entry.env).toBeDefined();
  });

  it('sets env.CLAUDE_PLUGIN_ROOT to "."', () => {
    expect(entry.env?.CLAUDE_PLUGIN_ROOT).toBe(".");
  });
});

describe("AC4: package.json main and version", () => {
  it("main field is dist/mcp/main.js", () => {
    expect(PKG.main).toBe("dist/mcp/main.js");
  });

  it('version is "0.3.0"', () => {
    expect(PKG.version).toBe("0.3.0");
  });
});

describe("AC4b: SERVER_VERSION matches package.json", () => {
  it("server.ts SERVER_VERSION equals package.json version", () => {
    const source = readText("src/mcp/server.ts");
    const match = source.match(/const SERVER_VERSION\s*=\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(PKG_VERSION);
  });
});

describe("AC5: CLAUDE.md documents tools and skills", () => {
  const content = readText("CLAUDE.md");

  const EXPECTED_TOOLS = [
    "build-system-map",
    "derive-hotspots",
    "generate-foundry-poc",
    "get-finding",
    "get_checklist",
    "run-aderyn",
    "run-slither",
    "search_findings",
    "verify-finding",
  ] as const;

  it("Tools Reference table lists exactly the expected tools", () => {
    const toolsSection = content.match(
      /## Tools Reference\n[\s\S]*?(?=\n## |\n*$)/,
    )?.[0] ?? "";
    const toolNames =
      [...toolsSection.matchAll(/^\|[^|]*`([a-z][a-z0-9_-]*)`/gm)]
        .map((m) => m[1])
        .sort();
    expect(toolNames).toEqual([...EXPECTED_TOOLS]);
  });

  it("documents the security-auditor skill", () => {
    expect(content).toContain("## Skills");
    expect(content).toContain("/security-auditor");
  });
});
