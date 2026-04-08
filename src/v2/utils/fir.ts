import { execFile } from "child_process";
import { FetchTokenParams, FirTokenResult, UploadFirParams } from "../types";
// import FormData from "form-data";
import { log } from "@clack/prompts";
import fetch, { FormData, fileFromSync } from "node-fetch";
// import { version } from "os";
// import { resolve } from "path";

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch (_error) {
    return String(error);
  }
}

function summarizeCurlFailure(error: unknown, stderr: string, responseBody: string) {
  const message = formatErrorMessage(error);
  const curlCode = message.match(/curl:\s*\((\d+)\)\s*([^\n]+)/);
  if (curlCode) {
    return `curl(${curlCode[1]}): ${curlCode[2].trim()}`;
  }

  const firstStderrLine = stderr
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstStderrLine) {
    return firstStderrLine;
  }

  const firstResponseLine = responseBody
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstResponseLine) {
    return firstResponseLine;
  }

  return message.split("\n")[0] || "curl 上传失败";
}

export async function getToken(
  params: FetchTokenParams
): Promise<FirTokenResult> {
  const { apiToken, platform, packageName } = params;
  const body = JSON.stringify({
    type: platform.toLowerCase().trim(),
    bundle_id: packageName,
    api_token: apiToken,
  });
  log.info(body);

  let result: unknown;
  try {
    const response = await fetch("http://api.appmeta.cn/apps", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    result = await response.json();
  } catch (error) {
    const message = `获取 Fir token 失败: ${formatErrorMessage(error)}`;
    log.error(message);
    throw new Error(message);
  }

  const binary = (
    result as {
      cert: { binary: { upload_url: string; key: string; token: string } };
    }
  ).cert.binary;

  if (!binary?.upload_url || !binary.key || !binary.token) {
    throw new Error(`Fir token 响应格式异常: ${JSON.stringify(result)}`);
  }

  return {
    url: binary.upload_url,
    key: binary.key,
    token: binary.token,
  };
}

/**
 * @deprecated
 * @param params
 */
export async function upload(params: UploadFirParams) {
  const {
    url,
    key,
    token,
    platform,
    filepath,
    appName,
    versionCode,
    versionName,
  } = params;

  const form = new FormData();
  form.set("key", key);
  form.set("token", token);
  form.set("x:name", appName);
  form.set("x:version", versionName);
  form.set("x:build", versionCode);
  if (platform === "iOS") {
    form.set("x:release_type", "Adhoc");
  }
  form.set("file", new Blob([fileFromSync(filepath)]));
  const res = await fetch(url, {
    method: "POST",
    body: form,
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  console.log(res.headers);
  const result = await res.json();

  if (!(result as { is_completed: boolean }).is_completed) {
    throw new Error(`upload to fir failed: ${JSON.stringify(result)}`);
  }
}

export async function uploadByCurl(params: UploadFirParams) {
  const { url, key, token, filepath, appName, versionCode, versionName } =
    params;

  const args = [
    "-sS",
    "-w",
    "\n__HTTP_CODE__:%{http_code}",
    "-F",
    `key=${key}`,
    "-F",
    `token=${token}`,
    "-F",
    `file=@${filepath}`,
    "-F",
    `x:name=${appName}`,
    "-F",
    `x:version=${versionName}`,
    "-F",
    `x:build=${versionCode}`,
    "-F",
    "x:release_type=Adhoc",
    url,
  ];

  await new Promise<void>((resolve, reject) => {
    execFile("curl", args, (error, stdout, stderr) => {
      const output = typeof stdout === "string" ? stdout : String(stdout ?? "");
      const errorOutput =
        typeof stderr === "string" ? stderr : String(stderr ?? "");
      const marker = "\n__HTTP_CODE__:";
      const markerIndex = output.lastIndexOf(marker);
      const responseBody =
        markerIndex >= 0 ? output.slice(0, markerIndex).trim() : output.trim();
      const httpCode =
        markerIndex >= 0 ? output.slice(markerIndex + marker.length).trim() : "";

      if (error) {
        reject(
          new Error(
            [
              `上传 Fir 失败: ${summarizeCurlFailure(
                error,
                errorOutput,
                responseBody,
              )}`,
              httpCode ? `httpCode=${httpCode}` : "",
              errorOutput ? `stderr=${errorOutput}` : "",
              responseBody ? `response=${responseBody}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      if (!httpCode || Number(httpCode) >= 400) {
        reject(
          new Error(
            [
              "上传 Fir 失败: 上传接口返回异常",
              httpCode ? `httpCode=${httpCode}` : "",
              errorOutput ? `stderr=${errorOutput}` : "",
              responseBody ? `response=${responseBody}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }

      resolve();
    });
  });

  return true;
}

// DEBUG:
// async function test() {
//   try {
//     const result = await getToken({
//       apiToken: "c1fac02cef8a0e1db76349d81860cdd3",
//       platform: "android",
//       packageName: "com.rn2014",
//     });

//     console.log(res.stdout);
//   } catch (error) {
//     console.error(error);
//   }
// }

// test();
