import { Platform } from "../types";
import { setTaskName } from "../utils/common";
import { getToken, upload, uploadByCurl } from "../utils/fir";
async function uploadFir(context: any, apiToken: string, platform: Platform) {
  try {
    const { buildAndroid, prepareEnv } = context;
    const { productFile } = buildAndroid;
    const { PACKAGE_ID, APP_NAME, versionCode, versionName } = prepareEnv;
    const uploadWithToken = await getToken({
      apiToken,
      platform,
      packageName: PACKAGE_ID, // 来源于 .env
    });
    await uploadByCurl({
      ...uploadWithToken,
      platform,
      appName: APP_NAME,
      versionCode: versionCode,
      versionName: versionName,
      filepath: productFile,
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
