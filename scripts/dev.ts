import { spawn } from "node:child_process";

const repoCwd = process.cwd();
const runtimeUpArgs = [
  "compose",
  "-f",
  ".docker/dashboard/docker-compose.yml",
  "up",
  "-d",
  "--build",
  "--remove-orphans",
  "app-builder-runtime",
];
const runtimeDownArgs = [
  "compose",
  "-f",
  ".docker/dashboard/docker-compose.yml",
  "stop",
  "-t",
  "1",
  "app-builder-runtime",
];
const runtimeUrl = process.env.APP_BUILDER_RUNTIME_URL ?? "http://127.0.0.1:4001";

function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }
) {
  return spawn(command, args, {
    cwd: options?.cwd ?? repoCwd,
    stdio: "inherit",
    env: options?.env ?? process.env,
  });
}

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRuntimeHealth(timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${runtimeUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // runtime is still booting
    }

    await sleep(1_000);
  }

  throw new Error(`runtime did not become healthy within ${timeoutMs / 1000} seconds`);
}

let isShuttingDown = false;
let dashboardProcess: ReturnType<typeof spawn> | undefined;
let executorProcess: ReturnType<typeof spawn> | undefined;

async function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  if (dashboardProcess && !dashboardProcess.killed) {
    dashboardProcess.kill("SIGTERM");
  }
  if (executorProcess && !executorProcess.killed) {
    executorProcess.kill("SIGTERM");
  }
  await waitForExit(runCommand("docker", runtimeDownArgs)).catch(() => 0);
  process.exit(exitCode);
}

async function main() {
  const runtimeExitCode = await waitForExit(runCommand("docker", runtimeUpArgs));
  if (runtimeExitCode !== 0) {
    process.exit(runtimeExitCode);
  }

  await waitForRuntimeHealth();

  const cleanupExitCode = await waitForExit(
    runCommand("bun", [
      "run",
      "src/runner/main.ts",
      "build",
      "recover-stale-runs",
      "--older-than-minutes",
      "5",
    ])
  );
  if (cleanupExitCode !== 0) {
    process.exit(cleanupExitCode);
  }

  const queueCleanupExitCode = await waitForExit(
    runCommand("bun", [
      "run",
      "src/runner/main.ts",
      "build",
      "recover-stale-queued-runs",
      "--older-than-minutes",
      "5",
    ])
  );
  if (queueCleanupExitCode !== 0) {
    process.exit(queueCleanupExitCode);
  }

  executorProcess = runCommand("bun", ["run", "src/executor/main.ts", "work"], {
    env: {
      ...process.env,
      APP_BUILDER_RUNTIME_URL: runtimeUrl,
    },
  });

  dashboardProcess = runCommand("bun", ["run", "web:dev"], {
    env: {
      ...process.env,
      APP_BUILDER_RUNTIME_URL: runtimeUrl,
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }

  const [source, exitCode] = await Promise.race([
    waitForExit(dashboardProcess).then((code) => ["dashboard", code] as const),
    waitForExit(executorProcess).then((code) => ["executor", code] as const),
  ]);

  if (source === "executor") {
    console.error("executor exited unexpectedly");
  }

  await shutdown(exitCode);
}

void main().catch(async (error) => {
  console.error(error);
  await shutdown(1);
});
