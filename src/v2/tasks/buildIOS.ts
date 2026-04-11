import { log } from "@clack/prompts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "path";
import { $, cd } from "zx";
import { Distribution } from "../types";
import { setTaskName } from "../utils/common";

type Options = {
  projectName: string;
  schema: string;
  buildType: string;
  exportOptionsPath: Record<Distribution, string>;
  distributions: Distribution[];
  ipaName: string;
  clean?: boolean;
  podInstall?: boolean;
  provisioningAuto?: boolean;
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
      podInstall,
      provisioningAuto = false,
    } = options;
    cd(resolve(workspace, "./ios"));

    await $`pwd`;
    $.env = {
      ...$.env,
      ENVFILE: envFileCache,
    };
    await $`echo $ENVFILE`;

    if (podInstall === true) {
      log.info("Run pod install: forced by build option.");
      await $`pod install`;
    } else if (shouldRunPodInstall(workspace)) {
      await $`pod install`;
    } else {
      log.info("Skip pod install: Podfile.lock unchanged.");
    }

    // 清理缓存
    if (clean) {
      await $`xcodebuild clean -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType}`;
    }

    // archive app
    await $`xcodebuild archive -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType} -disableAutomaticPackageResolution -destination generic/platform=ios -archivePath build/${schema} -quiet | xcpretty`;

    const ipaFiles: Record<Distribution, string> = { adHoc: "", appStore: "" };

    for (let distribution of distributions) {
      log.info(
        `Export ipa for ${distribution} ${exportOptionsPath[distribution]}`
      );
      const ipaPath = `${output}/${applicationId}_${env}_${versionName}_${distribution}`;
      const provisioningArgs = provisioningAuto
        ? ["-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration"]
        : [];

      await $`xcodebuild -exportArchive -archivePath build/${schema}.xcarchive -exportPath ${ipaPath} -exportOptionsPlist ${exportOptionsPath[distribution]} ${provisioningArgs} -quiet | xcpretty`;

      ipaFiles[distribution] = `${ipaPath}/${ipaName}.ipa`;
    }

    const result = {
      archiveFile: resolve(workspace, `./ios/build/${schema}.xcarchive`),
      ipaFiles,
    };

    log.info(JSON.stringify(result));
    logger.info(result);
    return result;
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

function shouldRunPodInstall(workspace: string) {
  const iosDir = resolve(workspace, "./ios");
  const podfileLock = resolve(iosDir, "./Podfile.lock");
  const manifestLock = resolve(iosDir, "./Pods/Manifest.lock");

  if (!existsSync(podfileLock) || !existsSync(manifestLock)) {
    return true;
  }

  try {
    const podfileContent = readFileSync(podfileLock, "utf8");
    const manifestContent = readFileSync(manifestLock, "utf8");
    return podfileContent !== manifestContent;
  } catch (_error) {
    return true;
  }
}
