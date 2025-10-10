import { log } from "@clack/prompts";
import { resolve } from "path";
import { $, cd } from "zx";
import { Distribution } from "../types";
import { setTaskName } from "../utils/common";

type Options = {
  projectName: string;
  schema: string;
  buildType: string;
  exportOptionsPath: string;
  distributions: Distribution[];
  ipaName: string;
  clean?: boolean;
};
async function buildIOS(context: any, options: Options) {
  try {
    const { workspace, output, prepareEnv, logger, env } = context;
    const { versionName, applicationId, envFileCache } = prepareEnv;
    const {
      projectName,
      schema,
      buildType,
      exportOptionsPath,
      distributions,
      ipaName,
      clean = false,
    } = options;
    cd(resolve(workspace, "./ios"));

    await $`pwd`;
    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
    };
    await $`echo $ENVFILE`;
    await $`pod install`;

    // 清理缓存
    if (clean) {
      await $`xcodebuild clean -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType}`;
    }

    // archive app
    await $`xcodebuild archive -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType} -disableAutomaticPackageResolution -destination generic/platform=ios -archivePath build/${schema} -quiet | xcpretty`;

    const ipaFiles: Record<Distribution, string> = { adHoc: "", appStore: "" };

    for (let distribution of distributions) {
      log.info(`Export ipa for ${distribution}`);
      const ipaPath = `${output}/${applicationId}_${env}_${versionName}_${distribution}`;

      await $`xcodebuild -exportArchive -archivePath build/${schema}.xcarchive -exportPath ${ipaPath} -exportOptionsPlist ${exportOptionsPath} -quiet | xcpretty`;

      ipaFiles[distribution] = `${ipaPath}/${ipaName}.ipa"`;
    }

    log.info(JSON.stringify(ipaFiles));
    logger.info(ipaFiles);
    return {
      // ipaFile: `${ipaPath}/${schema}.ipa`,
      ipaFiles,
    };
  } catch (error) {
    console.log(error);
  }
  return false;
}

export type BuildAndroidReturn = ReturnType<typeof buildIOS>;

export default function createBuildIOS(options: Options) {
  const task = (context: any) => buildIOS(context, options);
  setTaskName("buildIOS", task);
  return task;
}
