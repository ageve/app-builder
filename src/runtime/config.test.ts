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
  test("resolves repo-backed pipelines deterministically", () => {
    const request = {
      runId: "deterministic-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      args: {},
    };
    const first = resolveRunConfigFromRequest(process.cwd(), request);
    const second = resolveRunConfigFromRequest(process.cwd(), request);
    expect(first).toEqual(second);
    expect(first.pipeline.platform).toBe("android");
    expect(first.source).toEqual({
      workspaceId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
    });
  });

  test("derives files from workspace plus pipeline selection", () => {
    const resolved = resolveRunConfigFromRequest(process.cwd(), {
      runId: "derived-files-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-ios-production",
      args: {},
    });

    expect(resolved.files.envFile).toContain(
      "envs/hugo-aiv-app/.env.hookAi.production"
    );
    expect(resolved.files.envConfigFile).toContain(
      "envs/hugo-aiv-app/.env.hookAi.xcconfig"
    );
    expect(resolved.files.exportOptionsAppStore).toContain(
      "envs/hugo-aiv-app/hookAi.ExportOptions.appstore.plist"
    );
  });

  test("fails when derived files are missing", () => {
    const root = resolve(tmpdir(), `app-builder-config-test-${Date.now()}`);
    tempRoots.push(root);
    mkdirSync(resolve(root, "configs/projects"), { recursive: true });
    mkdirSync(resolve(root, "configs/profiles"), { recursive: true });

    writeFileSync(
      resolve(root, "configs/projects/demo.json"),
      JSON.stringify({
        id: "demo",
        name: "Demo",
        gitUri: "git@github.com:example/demo.git",
        pipelineOptions: {
          gitUri: "git@github.com:example/demo.git",
        },
      })
    );
    writeFileSync(
      resolve(root, "configs/profiles/demo-profile.json"),
      JSON.stringify({
        id: "demo-profile",
        projectId: "demo",
        packageAlias: "demo",
        platform: "android",
        env: "alpha",
        branch: "main",
      })
    );

    expect(() =>
      resolveRunConfigFromRequest(root, {
        runId: "missing-file-run",
        projectId: "demo",
        profileId: "demo-profile",
        args: {},
      })
    ).toThrow("envFile does not exist");
  });

  test("args cannot override pipeline branch, platform, or env", () => {
    const resolved = resolveRunConfigFromRequest(process.cwd(), {
      runId: "args-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      args: {
        autoVersionCode: true,
        branch: "should-not-apply",
        env: "production",
        platform: "iOS",
      },
    });

    expect(resolved.pipeline.branch).toBe("alpha");
    expect(resolved.pipeline.env).toBe("alpha");
    expect(resolved.pipeline.platform).toBe("android");
    expect(resolved.args.autoVersionCode).toBe(true);
  });

  test("can rebase a resolved config to a different cwd", () => {
    const resolved = resolveRunConfigFromRequest(process.cwd(), {
      runId: "rebase-run",
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      args: {},
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
      args: {},
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
        agconnectFile:
          "/workspace/app-builder/envs/hugo-aiv-app/hookAi-agconnect-services.json",
      },
      flags: {
        autoVersionCode: false,
        legacyVersioning: false,
        cleanWorkspace: true,
      },
      features: {
        codemodAndroid: true,
        copyToFileBrowser: true,
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
        workspaceId: "hugo-aiv-app",
        profileId: "hookAi-android-alpha",
      },
    });

    expect(rebased.defaults.workspace).toBe(
      "/Users/demo/app-builder-cache/projects/demo"
    );
    expect(rebased.defaults.runDir).toBe("/Users/demo/app-builder/.runs/wm-run");
  });
});
