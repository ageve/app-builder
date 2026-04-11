import { describe, expect, it } from "bun:test";

const cwd = "/Users/ben/Documents/workspace/business/app-builder";

async function runCli(args: string[]) {
  const proc = Bun.spawn({
    cmd: ["bun", "run", "src/cli/mod.ts", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

describe("mod.ts help", () => {
  it("根帮助里展示新的子命令和 build 示例", async () => {
    const result = await runCli(["-h"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("resume <buildId>");
    expect(result.stdout).toContain("retry <buildId>");
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("asc upload <buildId>");
    expect(result.stdout).toContain("log <buildId>");
    expect(result.stdout).toContain("--android:buildAndroid.clear false");
    expect(result.stdout).toContain("--ios:buildIOS.podInstall true");
    expect(result.stdout).toContain("--ios:buildIOS.provisioningAuto true");
    expect(result.stdout).toContain("clear --all --log");
    expect(result.stdout).toContain("查看今天的构建历史");
    expect(result.stdout).toContain("平台专属参数格式");
  });

  it("build 帮助里展示多平台和 android 任务参数", async () => {
    const result = await runCli(["build", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--platform");
    expect(result.stdout).toContain("ios,android");
    expect(result.stdout).toContain("--android:buildAndroid.clear");
    expect(result.stdout).toContain("--ios:buildIOS.podInstall");
    expect(result.stdout).toContain("--ios:buildIOS.provisioningAuto");
    expect(result.stdout).toContain("不传时沿用当前项目原有逻辑");
  });

  it("clear 帮助里展示 all 和 log 参数", async () => {
    const result = await runCli(["clear", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--all");
    expect(result.stdout).toContain("--log");
    expect(result.stdout).toContain("默认只清理今天以前");
  });

  it("缺少 build 必填参数时直接报错", async () => {
    const result = await runCli(["build", "--app", "hookAi"]);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(combinedOutput).toContain("缺少必要参数");
  });
});
