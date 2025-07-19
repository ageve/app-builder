import fetch from "node-fetch";
import { setTaskName } from "../utils/common";

async function notifyBusinessWechat(context: any, webhook: string) {
  try {
    const { projectName, branch, variables, prepareEnv } = context;
    const { versionName, versionCode, applicationId } = prepareEnv;
    // 添加预设模板
    await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "markdown",
        // TODO: 预置文案，调用方可以重新定义
        markdown: {
          content: `
## <font color=\"#52c41a\">构建机流水线消息${projectName}</font>\n
**触发消息**：手动触发\n
**部署消息**：发布至 pgyer.com\n
**运行状态**：✅ <font color=\"#52c41a\">运行成功</font>\n
>commit：${variables.commitId}
>包名：${applicationId}
>分支：${branch}
>版本：${versionName}(Build ${versionCode})`,
        },
      }),
    });
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export default function createNotifyBusinessWechat(webhook: string) {
  const task = (context: any) => notifyBusinessWechat(context, webhook);
  setTaskName("notifyBusinessWechat", task);
  return task;
}
