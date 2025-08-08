import { copySync, readdirSync, removeSync } from "fs-extra";
import path, { resolve } from "path";
import { $, cd } from "zx";
import { setTaskName } from "../utils/common";

async function buildAndroid(context: any, options?: { clean?: boolean }) {
  try {
    const { workspace, output, prepareEnv, variables, logger, env } = context;
    const { commitId } = variables;
    const { versionName, applicationId, envFileCache, versionCode } =
      prepareEnv;
    cd(resolve(workspace, "./android"));
    await $`pwd`;
    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
    };
    await $`echo $ENVFILE`;
    await $`chmod +x gradlew`;
    if (options?.clean) {
      await $`./gradlew clean -q -Dorg.gradle.logging.level=quiet`;
    }

    await $`./gradlew assembleRelease -q -Dorg.gradle.logging.level=quiet`;

    const names = [
      applicationId,
      versionCode,
      versionName,
      env ?? "",
      commitId,
    ];
    const productFile = (abi = "") =>
      `${output}/${[...names, abi].filter((it) => it).join("_")}.apk`;
    // TODO：准确的获取到 gradle 产出物；这个是定义到 build.gradle 里的
    const list: string[] = [];
    const files = readdirSync("app/build/outputs/apk/release");
    for (const file of files) {
      const match = file.match(/^app-([^-]+)-release\.apk$/);
      if (match && match.length > 1) {
        const abi = match[1];
        const output = productFile(abi);
        list.push(output);
        copySync(path.join("app/build/outputs/apk/release", file), output);
      }
    }

    removeSync(envFileCache);

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
