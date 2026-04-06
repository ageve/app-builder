import { log, spinner } from "@clack/prompts";
import { FormData } from "formdata-node";
import { fileFromPath } from "formdata-node/file-from-path";
import fetch from "node-fetch";
import path from "path";
import builderConfig from "../config.global";
import { setTaskName } from "../utils/common";

import { FormDataEncoder } from "form-data-encoder";
import { Readable } from "stream";
const s = spinner();

export default async function uploadQiniu(
  context: any,
  options?: { key: string }
) {
  try {
    const { buildAndroid, prepareEnv, logger, env } = context;
    const { productFiles } = buildAndroid;
    const { versionName } = prepareEnv;
    const target = (productFiles as string[]).find((it) =>
      it.includes("universal")
    );
    if (!target) return false;
    // get uploadToken
    const url =
      env === "alpha"
        ? builderConfig.uploadApi?.alpha
        : builderConfig.uploadApi?.prod;
    if (!url) throw new Error("configGlobal missing uploadApi");
    const key = options?.key
      ? options.key.replace("{versionName}", versionName)
      : undefined;
    s.start("Uploading to QiNiu");
    const uploadRes = await qiniuClient({
      url,
      name: path.basename(target),
      file: target,
      key,
    });

    if (uploadRes) {
      log.success("[downloadUrl] " + uploadRes.url);
      return { downloadUrl: uploadRes.url };
    }
  } catch (error) {
    console.log(error);
  } finally {
    s.stop("Finished");
  }
  return false;
}
setTaskName("uploadQiniu", uploadQiniu);

export function createUploadQiniu(options?: { key: string }) {
  const task = (context: any) => uploadQiniu(context, options);
  setTaskName("uploadQiniu", task);
  return task;
}

export type UploadResDtoStorage =
  (typeof UploadResDtoStorage)[keyof typeof UploadResDtoStorage];

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const UploadResDtoStorage = {
  Bos: "Bos",
  Qiniu: "Qiniu",
  AliOss: "AliOss",
  Mp: "Mp",
} as const;

interface UploadResDto {
  domain: string;
  id: string;
  key: string;
  region: string;
  storage: UploadResDtoStorage;
  token: string;
  url: string;
}

async function qiniuClient({
  url,
  name,
  key,
  file,
}: {
  url: string;
  name: string;
  key?: string;
  file: string;
}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      storage: "Qiniu",
      size: 0,
      key,
      name: name,
      fileType: "txt",
      width: 0,
      height: 0,
      originPath: "string",
      userId: 0,
    }),
  });

  const data = (await response.json()) as UploadResDto;
  console.log("[data]", data.url);

  const form = new FormData();
  form.set("key", key ?? data.key);
  form.set("token", data.token);
  form.set("file", await fileFromPath(file));
  // 生成 multipart body + headers
  const encoder = new FormDataEncoder(form);

  const res = await fetch("https://up-z2.qiniup.com", {
    method: "POST",
    headers: encoder.headers, // ✔ 自动带 boundary
    body: Readable.from(encoder), // ✔ 将 multipart 正确流式传输
  });

  const result = await res.json();
  if ("hash" in (result as object)) {
    return { ...(result as object), url: data.url } as {
      hash: string;
      key: string;
      url: string;
    };
  }
  throw new Error(result as any);
}

// test
// async function test() {
//   try {
//     s.start("Uploading to QiNiu");
//     const result = await qiniuClient({
//       url: "https://hugoapia.yocdev.com/storage/upload",
//       name: "hookai-test.apk",
//       key: "res/apk/hookai-test.apk",
//       file: path.resolve(cwd(), "test.apk"),
//     });
//     log.success("[Upload Success]");
//     console.log(result as { hash: string; key: string; url: string });
//     return result;
//   } catch (error) {
//     log.error("[Upload Qiniu failed]");
//     console.error(error);
//   } finally {
//     s.stop("Finished");
//   }
// }

// test();
