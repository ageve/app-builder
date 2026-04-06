import { log } from "@clack/prompts";
import { Platform } from "../types";
import { setTaskName } from "../utils/common";
import { getToken, uploadByCurl } from "../utils/fir";
async function uploadFir(
  context: any,
  options: { apiToken: string; platform: Platform; customAppName?: string }
) {
  try {
    const { prepareEnv } = context;
    const { applicationId, appName, versionCode, versionName } = prepareEnv;
    const { platform, apiToken, customAppName } = options;
    let file: string | undefined = "";
    log.info(
      `upload Fir.im,${platform} App. ${JSON.stringify(context.buildIOS)}`
    );
    if (platform === "android") {
      const { productFiles } = context.buildAndroid;
      file = (productFiles as string[]).find((it) => it.includes("universal"));
    }
    if (platform === "iOS") {
      const { ipaFiles } = context.buildIOS;
      file = ipaFiles.adHoc;
    }
    if (!Boolean(file)) {
      log.error(`miss output file`);
      return false;
    }
    const uploadWithToken = await getToken({
      apiToken,
      platform,
      packageName: applicationId, // 来源于 .env
    });
    await uploadByCurl({
      ...uploadWithToken,
      platform,
      appName: customAppName || appName,
      versionCode: versionCode,
      versionName: versionName,
      filepath: file as string,
    });
    return true;
  } catch (error) {
    console.log("上传 Fir.im 失败", error);
  }
  return false;
}

export default function createUploadFir(
  apiToken: string,
  platform: Platform,
  customAppName?: string
) {
  const task = (context: any) =>
    uploadFir(context, { apiToken, platform, customAppName });
  setTaskName("uploadFir", task);
  return task;
}
