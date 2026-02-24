/** sc-auditor: Smart Contract Security Auditor Plugin */

export { loadConfig } from "./config/index.js";
export type { AllowedSeverity } from "./core/index.js";
export { validateSeverityList } from "./core/index.js";
export { discoverSolidityFiles, getDiscoveryWarnings } from "./core/index.js";
export * from "./types/index.js";
