import { ensureDir } from "fs-extra";
import { setTaskName } from "../utils/common";
export default async function prepareWorkspace(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    await ensureDir(context.workspace);
    return true;
  } catch (error) {
    console.log("创建失败", error);
  }
  return false;
}
setTaskName("prepareWorkspace", prepareWorkspace);
