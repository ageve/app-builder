import { log } from "@clack/prompts";
import { Platform } from "../types";
import { setTaskName } from "../utils/common";
import { getToken, uploadByCurl } from "../utils/fir";
async function uploadFir(context: any, apiToken: string, platform: Platform) {
  try {
    const { buildAndroid, prepareEnv, buildIOS } = context;
    const { productFiles } = buildAndroid;
    const { ipaFiles } = buildIOS;
    const { applicationId, appName, versionCode, versionName } = prepareEnv;
    let file: string | undefined = "";
    if (platform === "android") {
      file = (productFiles as string[]).find((it) => it.includes("universal"));
    }
    if (platform === "iOS") {
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
    await uploadByCurl({
      ...uploadWithToken,
      platform,
      appName: appName,
      versionCode: versionCode,
      versionName: versionName,
      filepath: file,
    });
    return true;
  } catch (error) {
    console.log("上传 Fir.im 失败", error);
  }
  return false;
}

export default function createUploadFir(apiToken: string, platform: Platform) {
  const task = (context: any) => uploadFir(context, apiToken, platform);
  setTaskName("uploadFir", task);
  return task;
}
