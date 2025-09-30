import { log } from "@clack/prompts";
import { $ } from "zx";
import { setTaskName } from "../utils/common";
type Options = {
  keychain: string;
};
async function uploadAppStore(context: any, options: Options) {
  try {
    const { buildIOS } = context;
    const { ipaFiles } = buildIOS;
    const { keychain } = options;
    await $`xcrun notarytool submit ${ipaFiles.appStore} --keychain-profile ${keychain} --wait`;
    return true;
  } catch (error) {
    log.error("上传 appStore 失败");
    console.log(error);
  }
  return false;
}

export default function createUploadAppStore(options: Options) {
  const task = (context: any) => uploadAppStore(context, options);
  setTaskName("uploadAppStore", task);
  return task;
}
