import { resolve } from "path";
import { $, cd } from "zx";
import { setTaskName } from "../utils/common";

async function buildIOS(context: any, options?: {}) {
  try {
    const { workspace, output, prepareEnv, logger, env } = context;
    const { versionName, applicationId, envFileCache } = prepareEnv;
    cd(resolve(workspace, "./ios"));
    await $`pwd`;
    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
    };
    await $`echo $ENVFILE`;
    await $`pod install`;

    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export type BuildAndroidReturn = ReturnType<typeof buildIOS>;

export default function createBuildIOS(options?: {}) {
  const task = (context: any) => buildIOS(context, options);
  setTaskName("buildIOS", task);
  return task;
}
