import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { adaptResolvedRunConfigToCwd, resolveRunConfigFromRequest } from "./config";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

describe("resolveRunConfigFromRequest", () => {
  test("resolves repo-backed profiles deterministically", () => {
    const request = {
      runId: "deterministic-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      overrides: {},
    };
    const first = resolveRunConfigFromRequest(process.cwd(), request);
    const second = resolveRunConfigFromRequest(process.cwd(), request);
    expect(first).toEqual(second);
    expect(first.pipeline.platform).toBe("android");
    expect(first.source.templates).toEqual([
      "android-alpha-base",
      "hookai-brand-base",
    ]);
  });

  test("fails when referenced files are missing", () => {
    const root = resolve(tmpdir(), `app-builder-config-test-${Date.now()}`);
    tempRoots.push(root);
    mkdirSync(resolve(root, "configs/projects"), { recursive: true });
    mkdirSync(resolve(root, "configs/templates"), { recursive: true });
    mkdirSync(resolve(root, "configs/profiles"), { recursive: true });

    writeFileSync(
      resolve(root, "configs/projects/demo.json"),
      JSON.stringify({
        id: "demo",
        name: "Demo",
        gitUri: "git@github.com:example/demo.git",
        defaults: {},
      })
    );
    writeFileSync(
      resolve(root, "configs/templates/android.json"),
      JSON.stringify({
        id: "android",
        kind: "pipeline-template",
        pipeline: {
          platform: "android",
          env: "alpha",
          branch: "main",
        },
      })
    );
    writeFileSync(
      resolve(root, "configs/profiles/demo-profile.json"),
      JSON.stringify({
        id: "demo-profile",
        projectId: "demo",
        extends: ["android"],
        pipeline: {
          packageAlias: "demo",
          platform: "android",
          env: "alpha",
          branch: "main",
        },
        files: {
          envFile: "envs/demo/.env.alpha",
          envPropertiesFile: "envs/demo/.env.properties",
        },
      })
    );

    expect(() =>
      resolveRunConfigFromRequest(root, {
        runId: "missing-file-run",
        projectId: "demo",
        profileId: "demo-profile",
        overrides: {},
      })
    ).toThrow("envFile does not exist");
  });

  test("can rebase a resolved config to a different cwd", () => {
    const resolved = resolveRunConfigFromRequest(process.cwd(), {
      runId: "rebase-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      overrides: {},
    });

    const rebased = adaptResolvedRunConfigToCwd(
      "/tmp/app-builder-rebased",
      resolved
    );

    expect(rebased.defaults.rootCwd).toBe("/tmp/app-builder-rebased");
    expect(rebased.defaults.runDir).toContain("/tmp/app-builder-rebased/");
    expect(rebased.files.envFile).toContain("/tmp/app-builder-rebased/");
    expect(rebased.pipeline).toEqual(resolved.pipeline);
    expect(rebased.source).toEqual(resolved.source);
  });

  test("rebase handles workspace paths that live next to the repo root", () => {
    const rebased = adaptResolvedRunConfigToCwd("/Users/demo/app-builder", {
      runId: "wm-run",
      projectId: "hugo-aiv-app",
      projectName: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      pipeline: {
        packageAlias: "hookAi",
        platform: "android",
        env: "alpha",
        branch: "alpha",
      },
      gitUri: "git@github.com:example/hugo-aiv-app.git",
      defaults: {
        rootCwd: "/workspace/app-builder",
        workspace: "/workspace/app-builder-cache/projects/demo",
        outputDir: "/workspace/app-builder/build/wm-run",
        runDir: "/workspace/app-builder/.runs/wm-run",
        logFile: "/workspace/app-builder/.runs/wm-run/pipeline.log",
      },
      files: {
        envFile: "/workspace/app-builder/envs/hugo-aiv-app/.env.hookAi.alpha",
        envPropertiesFile:
          "/workspace/app-builder/envs/hugo-aiv-app/.env.hookAi.properties",
      },
      flags: {
        autoVersionCode: false,
        legacyVersioning: false,
        cleanWorkspace: true,
      },
      features: {
        codemodAndroid: false,
        copyToFileBrowser: false,
        syncArchive: false,
      },
      build: {
        iosProjectName: "aiv",
        iosScheme: "aiv",
        iosBuildType: "Release",
        ipaName: "aiv",
        distributions: ["adHoc"],
      },
      uploads: {},
      source: {
        templates: [],
      },
    });

    expect(rebased.defaults.workspace).toBe(
      "/Users/demo/app-builder-cache/projects/demo"
    );
    expect(rebased.defaults.runDir).toBe("/Users/demo/app-builder/.runs/wm-run");
  });
});
