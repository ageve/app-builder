import { log } from "@clack/prompts";
import fetch from "node-fetch";
import path from "path";
import qiniu from "qiniu";
import builderConfig from "../config.global";
import { setTaskName } from "../utils/common";
const config = new qiniu.conf.Config({ useHttpsDomain: true });

function summarizeUploadApiResponse(data: unknown) {
  if (!data || typeof data !== "object") {
    return String(data);
  }

  const record = data as Record<string, unknown>;
  return JSON.stringify({
    code: record.code,
    message: record.message,
    msg: record.msg,
    key: record.key,
    token: typeof record.token === "string" ? "[present]" : record.token,
    url: record.url,
  });
}

export default async function uploadQiniu(
  context: any,
  options?: { key: string },
) {
  try {
    const { buildAndroid, prepareEnv, logger, env } = context;
    const { productFiles } = buildAndroid;
    const { versionName } = prepareEnv;
    const target = (productFiles as string[]).find((it) =>
      it.includes("universal"),
    );
    if (!target) return false;
    // get uploadToken
    const url =
      env === "alpha"
        ? builderConfig.uploadApi?.alpha
        : builderConfig.uploadApi?.prod;
    const token =
      env === "alpha"
        ? builderConfig.uploadToken?.alpha
        : builderConfig.uploadToken?.prod;
    if (!url) throw new Error("configGlobal missing uploadApi");
    console.log("[uploadQiniu]", url, token);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storage: "Qiniu",
        size: 0,
        key: `res/apk/${versionName}/钩子AI-10秒做引流视频.apk`,
        fileType: "apk",
        width: 0,
        height: 0,
        originPath: "string",
        userId: 0,
      }),
    });
    const data = (await response.json()) as any;
    if (!response.ok) {
      throw new Error(
        `uploadApi 请求失败: status=${response.status} body=${summarizeUploadApiResponse(
          data,
        )}`,
      );
    }

    console.log(JSON.stringify(data, null, 2));

    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    const key = options?.key
      ? options.key.replace("{versionName}", versionName)
      : data.key;
    const uploadToken = data.token;

    if (!uploadToken) {
      throw new Error(
        `uploadApi 返回缺少 token: ${summarizeUploadApiResponse(data)}`,
      );
    }

    if (!key) {
      throw new Error(
        `uploadApi 返回缺少 key: ${summarizeUploadApiResponse(data)}`,
      );
    }

    // const uploadRes = await new Promise((resolve, reject) => {
    //   formUploader.putFile(
    //     uploadToken,
    //     key,
    //     target,
    //     putExtra,
    //     function (respErr, respBody, respInfo) {
    //       if (respErr) {
    //         reject(respErr);
    //       }

    //       if (respInfo.statusCode == 200) {
    //         console.log("upload success \n");
    //         logger.info(data.url);
    //         resolve(true);
    //       } else {
    //         console.warn("something wrong \n");
    //         console.log(respInfo.statusCode);
    //         console.log(respBody, key, putExtra, target);
    //         resolve(false);
    //       }
    //     },
    //   );
    // });
    console.log({ uploadToken, key, target, putExtra });
    const uploadRes = await formUploader.putFile(
      uploadToken,
      key,
      target,
      putExtra,
    );
    log.success("[downloadUrl] " + data.url);
    console.log(JSON.stringify(data, null, 2));
    if (uploadRes) {
      return { downloadUrl: data.url };
    }
  } catch (error) {
    console.log(error);
    throw error instanceof Error ? error : new Error(String(error));
  }
  return false;
}
setTaskName("uploadQiniu", uploadQiniu);

export function createUploadQiniu(options?: { key: string }) {
  const task = (context: any) => uploadQiniu(context, options);
  setTaskName("uploadQiniu", task);
  return task;
}
