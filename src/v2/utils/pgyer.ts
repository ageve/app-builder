import { execFile } from "child_process";
import path from "path";
import { GetCorsTokenParams, UploadPgyerData } from "../types";

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
