import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  getBuildSummaryByBuildId,
  initBuildHistoryDb,
  upsertBuildHistory,
} from "./sqliteUtil";

const tempDbPaths: string[] = [];

afterEach(() => {
  for (const dbPath of tempDbPaths.splice(0)) {
    rmSync(dbPath, { force: true });
  }
});

async function createTestDb() {
  const dbPath = join(
    "/tmp",
    `app-builder-sqlite-util-${Date.now()}-${randomUUID()}.db`,
  );
  tempDbPaths.push(dbPath);
  return initBuildHistoryDb(
    {
      pipeId: "hookAi-android-production",
      projectName: "hugo-aiv-app",
      gitUri: "git@example.com:hugo-aiv-app.git",
      branch: "main",
      env: "production",
      platform: "android",
      workspace: "/tmp/workspace",
      buildOptions: {},
    },
    dbPath,
  );
}

describe("getBuildSummaryByBuildId()", () => {
  it("读取 prepareEnv 输出里的版本号", async () => {
    const dbInfo = await createTestDb();

    try {
      await upsertBuildHistory(dbInfo.db, {
        pipelineId: dbInfo.pipelineId,
        buildId: "build-success",
        taskName: "prepareEnv",
        taskIndex: 0,
        status: "success",
        taskOutput: JSON.stringify({
          versionCode: "101002",
          versionName: "1.1.2",
        }),
        contextOutputKey: "prepareEnv",
        startedAt: "2026-04-10T00:00:00.000Z",
        finishedAt: "2026-04-10T00:00:01.000Z",
      });

      const summary = await getBuildSummaryByBuildId(dbInfo.db, "build-success");

      expect(summary?.versionCode).toBe("101002");
      expect(summary?.versionName).toBe("1.1.2");
    } finally {
      await dbInfo.db.close();
    }
  });

  it("在 retry 构建里从任务上下文恢复版本号", async () => {
    const dbInfo = await createTestDb();

    try {
      await upsertBuildHistory(dbInfo.db, {
        pipelineId: dbInfo.pipelineId,
        buildId: "build-retry",
        taskName: "uploadQiniu",
        taskIndex: 5,
        status: "success",
        taskInput: JSON.stringify({
          prepareEnv: {
            versionCode: "101003",
            versionName: "1.1.3",
          },
        }),
        startedAt: "2026-04-10T00:00:00.000Z",
        finishedAt: "2026-04-10T00:00:01.000Z",
      });

      const summary = await getBuildSummaryByBuildId(dbInfo.db, "build-retry");

      expect(summary?.versionCode).toBe("101003");
      expect(summary?.versionName).toBe("1.1.3");
      expect(summary?.startTaskName).toBe("uploadQiniu");
    } finally {
      await dbInfo.db.close();
    }
  });
});
