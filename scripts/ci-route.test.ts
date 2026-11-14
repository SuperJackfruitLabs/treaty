import { afterEach, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "..");
const router = join(root, "scripts/ci-route.sh");
const temporaryRepositories: string[] = [];

function git(repository: string, ...arguments_: string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "CI route test",
      GIT_AUTHOR_EMAIL: "ci-route@example.invalid",
      GIT_COMMITTER_NAME: "CI route test",
      GIT_COMMITTER_EMAIL: "ci-route@example.invalid",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function createRepository(): { repository: string; base: string } {
  const repository = mkdtempSync(join(tmpdir(), "treaty-ci-route-"));
  temporaryRepositories.push(repository);
  git(repository, "init", "--quiet");
  writeFileSync(join(repository, ".base"), "base\n");
  git(repository, "add", ".base");
  git(repository, "commit", "--quiet", "-m", "base");
  return { repository, base: git(repository, "rev-parse", "HEAD") };
}

function writeChanges(repository: string, paths: string[]): void {
  for (const path of paths) {
    const destination = join(repository, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${path}\n`);
  }
  if (paths.length > 0) {
    git(repository, "add", ".");
    git(repository, "commit", "--quiet", "-m", "changes");
  }
}

function route(
  paths: string[],
  event = "pull_request",
  baseOverride?: string,
): Record<string, string> {
  const { repository, base } = createRepository();
  writeChanges(repository, paths);
  const output = join(repository, "output");
  const result = spawnSync("sh", [router], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT: event,
      PR_BASE: baseOverride ?? base,
      BEFORE: event === "push" ? base : "",
      GITHUB_OUTPUT: output,
    },
  });
  if (result.status !== 0) {
    throw new Error(`router failed:\n${result.stdout}${result.stderr}`);
  }
  return Object.fromEntries(
    readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error(`invalid router output: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("all supported root README names are docs-only", () => {
  expect(
    route([
      "README",
      "README.md",
      "README.markdown",
      "README.txt",
      "README.rst",
    ]),
  ).toEqual({ app: "false", docs: "true" });
});

test("docs and docs-site trees are docs-only", () => {
  expect(route(["docs/guide.md", "docs-site/src/content/index.mdx"])).toEqual({
    app: "false",
    docs: "true",
  });
});

test.each([
  ["mixed docs and code", ["docs/guide.md", "packages/example/src/index.ts"]],
  ["a nested README", ["packages/example/README.md"]],
  ["a workflow", [".forgejo/workflows/ci.yml"]],
  ["configuration", ["tsconfig.json"]],
  ["a package manifest", ["package.json"]],
  ["a lockfile", ["bun.lock"]],
  ["generated output", ["generated/events.json"]],
  ["code", ["apps/relay/src/main.ts"]],
])("%s runs full CI", (_name, paths) => {
  expect(route(paths)).toEqual({ app: "true", docs: "true" });
});

test("manual and unknown events run full CI", () => {
  expect(route(["docs/guide.md"], "workflow_dispatch")).toEqual({
    app: "true",
    docs: "true",
  });
});

test("pushes run full CI even when they contain only docs", () => {
  expect(route(["docs/guide.md"], "push")).toEqual({
    app: "true",
    docs: "true",
  });
});

test("a missing comparison base runs full CI", () => {
  expect(route(["docs/guide.md"], "pull_request", "not-a-commit")).toEqual({
    app: "true",
    docs: "true",
  });
});

test("an empty change set runs full CI", () => {
  expect(route([])).toEqual({ app: "true", docs: "true" });
});

test("the Forge workflow uses the tested router and keeps ci/check successful", () => {
  const workflow = readFileSync(
    join(root, ".forgejo/workflows/ci.yml"),
    "utf8",
  );
  expect(workflow).toContain("run: scripts/ci-route.sh");
  expect(workflow).toContain("if: needs.changes.outputs.app == 'true'");
  expect(workflow).toContain("if: needs.changes.outputs.docs == 'true'");
  expect(workflow).toContain("needs: [changes, application, docs]");
  expect(workflow).toContain("if: always()");
});
