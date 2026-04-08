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
    if (platform === "android") {
      const { productFiles } = context.buildAndroid;
      file = (productFiles as string[]).find((it) => it.includes("universal"));
    }
    if (platform === "iOS") {
      const { ipaFiles } = context.buildIOS;
      file = ipaFiles.adHoc;
    }
    if (!file) {
      log.error(`miss output file`);
      return false;
    }
    const uploadWithToken = await getToken({
      apiToken,
      platform,
      packageName: applicationId, // 来源于 .env
    });
    const uploaded = await uploadByCurl({
      ...uploadWithToken,
      platform,
      appName: customAppName || appName,
      versionCode: versionCode,
      versionName: versionName,
      filepath: file,
    });
    if (!uploaded) {
      throw new Error("上传 Fir 失败");
    }
    return true;
  } catch (error) {
    console.log("上传 Fir.im 失败", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
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
