import dayjs from "dayjs";
import {
  createReadonlyConnect,
  listBuildSummariesByDate,
} from "../../utils";
import type { BuildSummary } from "../../utils/sqliteUtil";

export async function handleHistory(params: {
  limit?: number;
  filter?: Record<string, string>;
}) {
  const db = await createReadonlyConnect();
  try {
    const safeLimit = Number.isFinite(params.limit)
      ? Math.max(1, Math.floor(params.limit!))
      : 10;
    const today = dayjs().format("YYYY-MM-DD");
    let builds = hideSupersededBuilds(
      await listBuildSummariesByDate(db, today),
    );

    if (params.filter && Object.keys(params.filter).length > 0) {
      builds = filterBuildSummaries(builds, params.filter);
    }

    builds = builds.slice(0, safeLimit);

    return {
      count: builds.length,
      builds: builds.map(serializeSummary),
    };
  } finally {
    await db.close();
  }
}

function serializeSummary(build: BuildSummary) {
  return {
    buildId: build.buildId,
    status: build.status,
    pipeId: build.pipeId,
    projectName: build.projectName,
    env: build.env ?? null,
    branch: build.branch ?? null,
    platform: build.platform ?? null,
    versionCode: build.versionCode ?? null,
    versionName: build.versionName ?? null,
    startedAt: build.startedAt,
    finishedAt: build.finishedAt ?? null,
    durationMs: build.durationMs ?? null,
    failedTaskName: build.failedTaskName ?? null,
  };
}

function filterBuildSummaries(
  builds: BuildSummary[],
  filters: Record<string, string>,
) {
  const entries = Object.entries(filters);
  if (entries.length === 0) return builds;

  return builds.filter((build) =>
    entries.every(([key, expected]) => {
      const actual = readFilterValue(build, key);
      if (!actual) return false;
      return actual.toLowerCase() === expected.toLowerCase();
    }),
  );
}

function readFilterValue(build: BuildSummary, key: string) {
  switch (key) {
    case "platform":
      return build.platform ?? null;
    case "env":
      return build.env ?? null;
    case "branch":
      return build.branch ?? null;
    case "status":
      return build.status ?? null;
    case "pipeId":
      return build.pipeId ?? null;
    case "project":
    case "projectName":
      return build.projectName ?? null;
    case "buildId":
      return build.buildId ?? null;
    default:
      return null;
  }
}

function hideSupersededBuilds(builds: BuildSummary[]) {
  const succeededKeys = new Set<string>();

  return builds.filter((build) => {
    const key = [
      build.projectName,
      build.pipeId,
      build.env ?? "",
      build.branch ?? "",
      build.platform ?? "",
      build.workspace ?? "",
    ].join("|");

    if (build.status === "success") {
      succeededKeys.add(key);
      return true;
    }

    if (
      succeededKeys.has(key) &&
      (build.status === "failed" || build.status === "interrupted")
    ) {
      return false;
    }

    return true;
  });
}
