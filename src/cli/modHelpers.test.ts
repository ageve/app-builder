import { describe, expect, it } from "bun:test";
import {
  createBuildPipelineIds,
  createPipelineArgsFromBuildOptions,
  extractTaskOptionsFromArgv,
  parseBuildPlatforms,
} from "./modHelpers";

describe("parseBuildPlatforms()", () => {
  it("支持逗号分隔多个平台", () => {
    expect(parseBuildPlatforms("ios,android")).toEqual(["ios", "android"]);
  });

  it("会去重并保留顺序", () => {
    expect(parseBuildPlatforms("android,ios,android")).toEqual([
      "android",
      "ios",
    ]);
  });

  it("遇到不支持的平台时抛错", () => {
    expect(() => parseBuildPlatforms("android,web")).toThrow(
      "不支持的平台",
    );
  });
});

describe("extractTaskOptionsFromArgv()", () => {
  it("读取 android buildAndroid clear 参数", () => {
    expect(
      extractTaskOptionsFromArgv({
        "android:buildAndroid.clear": false,
      }),
    ).toEqual({
      android: {
        buildAndroid: {
          clear: false,
        },
      },
    });
  });
});

describe("createBuildPipelineIds()", () => {
  it("为多平台生成 pipeline 列表", () => {
    expect(
      createBuildPipelineIds({
        app: "hookAi",
        env: "production",
        branch: "main",
        platforms: ["ios", "android"],
      }),
    ).toEqual([
      "hookAi-iOS-production-main",
      "hookAi-android-production-main",
    ]);
  });
});

describe("createPipelineArgsFromBuildOptions()", () => {
  it("从 buildOptions 里恢复 taskOptions", () => {
    expect(
      createPipelineArgsFromBuildOptions({
        autoVersionCode: true,
        legacyVersioning: false,
        taskOptions: {
          android: {
            buildAndroid: {
              clear: false,
            },
          },
        },
      }),
    ).toEqual({
      autoVersionCode: true,
      legacyVersioning: false,
      dryRun: false,
      taskOptions: {
        android: {
          buildAndroid: {
            clear: false,
          },
        },
      },
    });
  });
});
