import { exec } from "child_process";
import { FetchTokenParams, FirTokenResult, UploadFirParams } from "../types";
// import FormData from "form-data";
import fetch, { FormData, fileFromSync } from "node-fetch";
// import { version } from "os";
// import { resolve } from "path";
import { $ } from "zx/core";

export async function getToken(
  params: FetchTokenParams
): Promise<FirTokenResult> {
  const { apiToken, platform, packageName } = params;
  const result = await fetch("http://api.bq04.com/apps", {
    method: "POST",
    body: JSON.stringify({
      type: platform,
      bundle_id: packageName,
      api_token: apiToken,
    }),
    headers: { "Content-Type": "application/json" },
  }).then((resp) => resp.json());
  const binary = (
    result as {
      cert: { binary: { upload_url: string; key: string; token: string } };
    }
  ).cert.binary;
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
  try {
    const { url, key, token, filepath, appName, versionCode, versionName } =
      params;
    // DEBUG
    const command = `
    curl -s -o /dev/null -F "key=${key}"              \
       -F "token=${token}"           \
       -F "file=@${filepath}"            \
       -F "x:name=${appName}"             \
       -F "x:version=${versionName}"         \
       -F "x:build=${versionCode}"               \
       ${url}
    `
    console.log(command);
    exec(command)

    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
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
