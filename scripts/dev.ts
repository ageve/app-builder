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

let isShuttingDown = false;
let dashboardProcess: ReturnType<typeof spawn> | undefined;

async function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  if (dashboardProcess && !dashboardProcess.killed) {
    dashboardProcess.kill("SIGTERM");
  }
  await waitForExit(runCommand("docker", runtimeDownArgs)).catch(() => 0);
  process.exit(exitCode);
}

async function main() {
  const runtimeExitCode = await waitForExit(runCommand("docker", runtimeUpArgs));
  if (runtimeExitCode !== 0) {
    process.exit(runtimeExitCode);
  }

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

  dashboardProcess = runCommand("bun", ["run", "web:dev"], {
    env: {
      ...process.env,
      APP_BUILDER_RUNTIME_URL:
        process.env.APP_BUILDER_RUNTIME_URL ?? "http://127.0.0.1:4001",
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }

  const dashboardExitCode = await waitForExit(dashboardProcess);
  await shutdown(dashboardExitCode);
}

void main().catch(async (error) => {
  console.error(error);
  await shutdown(1);
});
