import { log } from "@clack/prompts";
import { $ } from "zx";
import { setTaskName } from "../utils/common";
type Options = {
  user: string;
  password: string;
};
async function uploadAppStore(context: any, options: Options) {
  try {
    const { buildIOS } = context;
    const { ipaFiles } = buildIOS;
    const { user, password } = options;
    await $`xcrun altool --upload-app -f ${ipaFiles.appStore} -u ${user} -p ${password} --verbose`;
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
