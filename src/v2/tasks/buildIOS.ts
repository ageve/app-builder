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
    const totalStart = Date.now();
    const stageDurationsMs: Record<string, number> = {};
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
      const podStart = Date.now();
      await $`pod install`;
      stageDurationsMs.podInstall = Date.now() - podStart;
    } else if (shouldRunPodInstall(workspace)) {
      const podStart = Date.now();
      await $`pod install`;
      stageDurationsMs.podInstall = Date.now() - podStart;
    } else {
      log.info("Skip pod install: Podfile.lock unchanged.");
      stageDurationsMs.podInstall = 0;
    }

    // 清理缓存
    if (clean) {
      await $`xcodebuild clean -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType}`;
    }

    // archive app
    const archiveStart = Date.now();
    await $`xcodebuild archive -workspace ${projectName}.xcworkspace -scheme ${schema} -configuration ${buildType} -disableAutomaticPackageResolution -destination generic/platform=ios -archivePath build/${schema} -quiet | xcpretty`;
    stageDurationsMs.archive = Date.now() - archiveStart;

    const ipaFiles: Record<Distribution, string> = { adHoc: "", appStore: "" };

    for (let distribution of distributions) {
      log.info(
        `Export ipa for ${distribution} ${exportOptionsPath[distribution]}`
      );
      const ipaPath = `${output}/${applicationId}_${env}_${versionName}_${distribution}`;
      const provisioningArgs = provisioningAuto
        ? ["-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration"]
        : [];

      const exportStart = Date.now();
      await $`xcodebuild -exportArchive -archivePath build/${schema}.xcarchive -exportPath ${ipaPath} -exportOptionsPlist ${exportOptionsPath[distribution]} ${provisioningArgs} -quiet | xcpretty`;
      stageDurationsMs[`export.${distribution}`] = Date.now() - exportStart;

      ipaFiles[distribution] = `${ipaPath}/${ipaName}.ipa`;
    }
    stageDurationsMs.total = Date.now() - totalStart;

    const result = {
      archiveFile: resolve(workspace, `./ios/build/${schema}.xcarchive`),
      ipaFiles,
      stageDurationsMs,
    };

    log.info(JSON.stringify(result));
    log.info(`[buildIOS] stageDurationsMs ${JSON.stringify(stageDurationsMs)}`);
    logger.info(JSON.stringify(result));
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
