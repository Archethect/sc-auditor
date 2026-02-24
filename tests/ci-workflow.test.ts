import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';

const WORKFLOW_PATH = resolve(
  import.meta.dirname,
  '..',
  '.github',
  'workflows',
  'ci.yml',
);

function loadWorkflow(): Record<string, unknown> {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');
  return yaml.load(content) as Record<string, unknown>;
}

describe('CI Workflow', () => {
  let workflow: Record<string, unknown>;

  beforeAll(() => {
    workflow = loadWorkflow();
  });

  // AC1: GitHub Actions CI workflow runs on the repository
  describe('AC1 - workflow file exists and has correct triggers', () => {
    it('should have a ci.yml workflow file', () => {
      expect(() => readFileSync(WORKFLOW_PATH, 'utf-8')).not.toThrow();
    });

    it('should be valid YAML', () => {
      expect(workflow).toBeDefined();
      expect(workflow).toHaveProperty('name');
    });

    it('should trigger on push to main', () => {
      const on = workflow.on as Record<string, unknown>;
      const push = on.push as Record<string, unknown>;
      expect(push).toBeDefined();
      expect(push.branches).toContain('main');
    });

    it('should trigger on pull_request targeting main', () => {
      const on = workflow.on as Record<string, unknown>;
      const pr = on.pull_request as Record<string, unknown>;
      expect(pr).toBeDefined();
      expect(pr.branches).toContain('main');
    });

    it('should use Node.js >= 22', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      const steps = ciJob.steps as Array<Record<string, unknown>>;

      const nodeStep = steps.find(
        (s) => (s.uses as string)?.startsWith('actions/setup-node'),
      );
      expect(nodeStep).toBeDefined();

      const withConfig = nodeStep?.with as Record<string, unknown>;
      const nodeVersion = String(withConfig['node-version']);
      expect(Number(nodeVersion)).toBeGreaterThanOrEqual(22);
    });
  });

  // AC2: Linting step passes in CI (npm run lint)
  describe('AC2 - linting step exists', () => {
    it('should have a lint step that runs npm run lint', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      const steps = ciJob.steps as Array<Record<string, unknown>>;

      const lintStep = steps.find(
        (s) =>
          (s.run as string)?.trim() === 'npm run lint' ||
          (s.name as string)?.toLowerCase().includes('lint'),
      );
      expect(lintStep).toBeDefined();
      expect((lintStep?.run as string)?.trim()).toBe('npm run lint');
    });
  });

  // AC3: Type checking step passes in CI (npm run typecheck)
  describe('AC3 - type checking step exists', () => {
    it('should have a typecheck step that runs npm run typecheck', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      const steps = ciJob.steps as Array<Record<string, unknown>>;

      const typecheckStep = steps.find(
        (s) =>
          (s.run as string)?.trim() === 'npm run typecheck' ||
          (s.name as string)?.toLowerCase().includes('typecheck'),
      );
      expect(typecheckStep).toBeDefined();
      expect((typecheckStep?.run as string)?.trim()).toBe('npm run typecheck');
    });
  });

  // AC4: All tests pass in CI (npm run test)
  describe('AC4 - test step exists', () => {
    it('should have a test step that runs npm run test', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      const steps = ciJob.steps as Array<Record<string, unknown>>;

      const testStep = steps.find(
        (s) =>
          (s.run as string)?.includes('npm run test') ||
          (s.name as string)?.toLowerCase().includes('test'),
      );
      expect(testStep).toBeDefined();
      expect((testStep?.run as string)).toContain('npm run test');
    });
  });

  // Edge case: npm install failure handling
  describe('Edge cases', () => {
    it('should have npm ci or npm install step before quality gates', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      const steps = ciJob.steps as Array<Record<string, unknown>>;

      const installIdx = steps.findIndex(
        (s) =>
          (s.run as string)?.includes('npm ci') ||
          (s.run as string)?.includes('npm install'),
      );
      expect(installIdx).toBeGreaterThanOrEqual(0);

      // Lint, typecheck, and test steps must come after install
      const lintIdx = steps.findIndex((s) =>
        (s.run as string)?.includes('npm run lint'),
      );
      const typecheckIdx = steps.findIndex((s) =>
        (s.run as string)?.includes('npm run typecheck'),
      );
      const testIdx = steps.findIndex((s) =>
        (s.run as string)?.includes('npm run test'),
      );

      expect(lintIdx).toBeGreaterThan(installIdx);
      expect(typecheckIdx).toBeGreaterThan(installIdx);
      expect(testIdx).toBeGreaterThan(installIdx);
    });

    it('should use ubuntu-latest runner', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ciJob = (jobs as Record<string, Record<string, unknown>>).ci;
      expect(ciJob['runs-on']).toBe('ubuntu-latest');
    });
  });
});
