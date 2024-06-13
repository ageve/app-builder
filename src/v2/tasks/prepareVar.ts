import { $ } from "zx";
import { setTaskName } from "../utils/common";
export default async function prepareVar(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    const commitId = await $`git rev-parse --short HEAD`;
    // const tagId = await $`git describe --abbrev=0 --tags`;
    const result = {
      commitId: commitId.stdout.replace("\n", ""),
      // tagId: tagId.stdout.replace("\n", ""),
    };
    return result;
  } catch (error) {
    console.log("创建失败", error);
  }
  return false;
}
setTaskName("variables", prepareVar);
