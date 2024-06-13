import fetch, { FormData } from "node-fetch";
import {
  GetCorsTokenParams,
  PgyerTokenResult,
  UploadPgyerData,
} from "../types";
import { URLSearchParams } from "url";
import { readFileSync } from "fs";
import { execFile } from "child_process";
import path, { resolve } from "path";
import { build } from "../../arsenalCore";

type UploadPgyerParams = {
  getCorsTokenData: GetCorsTokenParams;
  uploadData: UploadPgyerData;
};

export async function uploadPgyer({
  getCorsTokenData,
  uploadData,
}: UploadPgyerParams) {
  try {
    const { apiKey, ...others } = getCorsTokenData;
    const { productFile, filename } = uploadData;
    // console.log(getCorsTokenData);

    // const corsTokenFormData = new URLSearchParams();
    // corsTokenFormData.append("_api_key", apiKey);
    // Object.keys(others).forEach((key) => {
    //   const value = others[key as keyof typeof others];
    //   value && corsTokenFormData.append(key, value.toString());
    // });
    // const { data: result } = await fetch(
    //   "https://www.pgyer.com/apiv2/app/getCOSToken",
    //   {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/x-www-form-urlencoded",
    //     },
    //     body: corsTokenFormData.toString(),
    //   }
    // ).then((response: any) => response.json() as PgyerTokenResult);

    // ------------------------------------------------

    // console.log("[pgyer token]", result, productFile);
    // const uploadAppRequestData = new FormData();

    // Object.keys(result.params).forEach((key) => {
    //   const value = result[key as keyof typeof result];
    //   value && uploadAppRequestData.set(key, value);
    // });

    // uploadAppRequestData.set("file", new Blob([readFileSync(productFile)]));
    // filename && uploadAppRequestData.set("x-cos-meta-file-name", filename);

    // // FIXME:接口无法调通，太难了
    // const uploadResult = await fetch(result.endpoint, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "multipart/form-data",
    //   },
    //   body: uploadAppRequestData,
    // })
    //   .then((res) => {
    //     console.log("response.status;", res.status, res.headers);
    //     if (res.status === 204) {
    //       return { code: 0, message: "" };
    //     }
    //     return { code: res.status, message: res.statusText };
    //   })
    //   .catch((error) => {
    //     console.log(error);
    //   });
    await new Promise((resolve, reject) => {
      execFile(
        path.resolve(__dirname, "../shell/upload_pgyer.sh"),
        ["-k", apiKey, productFile],
        {},
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            try {
              const json = JSON.parse(stdout.trim());
              console.log(json);
            } catch (error) {
              console.log(stdout.trim());
            }
            resolve(true);
          }
        }
      );
    });
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
}
