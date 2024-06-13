import { copySync, removeSync } from "fs-extra";
import { resolve } from "path";
import { $, cd } from "zx";
import { setTaskName } from "../utils/common";
async function buildAndroid(context: any, options?: { clean?: boolean }) {
  try {
    const { workspace, output, prepareEnv, variables, logger } = context;
    const { commitId } = variables;
    const { versionName, PACKAGE_ID, envFileCache } = prepareEnv;
    cd(resolve(workspace, "./android"));
    await $`pwd`;
    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
    };
    await $`echo $ENVFILE`;
    await $`chmod +x gradlew`;
    if (options?.clean) {
      await $`./gradlew clean`;
    }
    await $`./gradlew assembleRelease --quiet`;
    const productFile = `${output}/${PACKAGE_ID}-${versionName}_${commitId}.apk`;
    // TODO：准确的获取到 gradle 产出物；这个是定义到 build.gradle 里的
    copySync("app/build/outputs/apk/release/app-release.apk", productFile);
    removeSync(envFileCache);
    const result = { productFile };
    logger.info(result);

    return result;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export default function createBuildAndroid(options?: { clean?: boolean }) {
  const task = (context: any) => buildAndroid(context, options);
  setTaskName("buildAndroid", task);
  return task;
}
