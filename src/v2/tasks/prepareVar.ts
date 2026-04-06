import { $ } from "zx";
import { setTaskName } from "../utils/common";
export default async function prepareVar(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    const { logger } = context;
    const commitId = await $`git rev-parse --short HEAD`;
    const commitCount = await $`git rev-list --count HEAD`;
    // const tagId = await $`git describe --abbrev=0 --tags`;
    const result = {
      commitId: commitId.toString().trim(),
      commitHashInt: parseInt(commitId.stdout.replace("\n", ""), 16).toString(),
      commitCount: Number(commitCount.stdout.replace("\n", "")),
    };
    logger.info(result);
    return result;
  } catch (error) {
    console.log("创建失败", error);
  }
  return false;
}
setTaskName("variables", prepareVar);
