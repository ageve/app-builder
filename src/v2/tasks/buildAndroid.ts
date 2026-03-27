import { copySync, pathExistsSync, readdirSync, writeFileSync } from "fs-extra";
import { homedir } from "node:os";
import path, { resolve } from "path";
import { $, cd } from "zx";
import { setTaskName } from "../utils/common";

function detectAndroidSdkRoot() {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    resolve(homedir(), "Library", "Android", "sdk"),
  ].filter((value): value is string => Boolean(value && value.trim()));

  return candidates.find((candidate) => pathExistsSync(candidate));
}

async function buildAndroid(context: any, options?: { clean?: boolean }) {
  try {
    const { workspace, output, prepareEnv, logger, env } = context;
    const { versionName, applicationId, envFileCache } = prepareEnv;
    cd(resolve(workspace, "./android"));
    await $`pwd`;
    const sdkRoot = detectAndroidSdkRoot();
    if (!sdkRoot) {
      throw new Error(
        "Android SDK not found. Set ANDROID_SDK_ROOT or install the SDK under ~/Library/Android/sdk."
      );
    }

    // Keep Gradle aligned with the local Android Studio SDK location.
    writeFileSync(
      resolve(workspace, "android", "local.properties"),
      `sdk.dir=${sdkRoot}\n`,
      "utf-8"
    );

    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    };
    logger.info({ androidSdkRoot: sdkRoot });
    await $`echo $ENVFILE`;
    await $`chmod +x gradlew`;
    if (options?.clean) {
      await $`./gradlew clean -q -Dorg.gradle.logging.level=quiet`;
    }

    await $`./gradlew assembleRelease -q -Dorg.gradle.logging.level=quiet`;

    const names = [
      applicationId,
      versionName,
      env ?? "",
    ];
    const productFile = (abi = "") =>
      `${output}/${[...names, abi].filter((it) => it).join("_")}.apk`;
    // TODO：准确的获取到 gradle 产出物；这个是定义到 build.gradle 里的
    const list: string[] = [];
    const files = readdirSync("app/build/outputs/apk/release");
    for (const file of files) {
      const match = file.match(/^app-(.+)-release\.apk$/);
      if (match && match.length > 1) {
        const abi = match[1];
        const output = productFile(abi);
        list.push(output);
        copySync(path.join("app/build/outputs/apk/release", file), output);
      }
    }

    // removeSync(envFileCache);

    const result = { productFiles: list };

    logger.info(result);
    await $`git reset --hard`;
    return result;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export type BuildAndroidReturn = ReturnType<typeof buildAndroid>;

export default function createBuildAndroid(options?: { clean?: boolean }) {
  const task = (context: any) => buildAndroid(context, options);
  setTaskName("buildAndroid", task);
  return task;
}
