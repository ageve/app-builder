import { log } from "@clack/prompts";
import { GetCorsTokenParams, Platform } from "../types";
import { setTaskName } from "../utils/common";
import { uploadPgyer } from "../utils/pgyer";

export async function uploadPgyerTask(
  context: any,
  data: GetCorsTokenParams,
  platform: Platform
) {
  try {
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
    await uploadPgyer({
      getCorsTokenData: data,
      uploadData: {
        productFile: file,
      },
    });
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export default function createUploadPgyer(
  data: GetCorsTokenParams,
  platform: Platform
) {
  const task = (context: any) => uploadPgyerTask(context, data, platform);
  setTaskName("uploadPgyer", task);
  return task;
}
