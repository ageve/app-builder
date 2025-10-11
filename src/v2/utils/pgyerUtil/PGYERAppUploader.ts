import { log } from "@clack/prompts";
import axios from 'axios';
import FormData from "form-data";
import fs from "fs";
import https from "https";
import path from 'path';
import querystring from "querystring";

export interface UploadOptions {
  filePath: string;
  log?: boolean;
  buildInstallType?: 1 | 2 | 3;
  buildPassword?: string;
  buildUpdateDescription?: string;
  buildInstallDate?: 1 | 2;
  buildInstallStartDate?: string;
  buildInstallEndDate?: string;
  buildChannelShortcut?: string;
}

export interface UploadResponse {
  code: number;
  message: string;
  data?: Record<string, any>;
}

export class PGYERAppUploader {
  private apiKey: string;
  private readonly LOG_TAG = "[PGYER APP UPLOADER]";

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("API Key is required.");
    this.apiKey = apiKey;
  }

  /**
   * 上传 App（支持 Promise 或回调）
   */
  upload(
    options: UploadOptions,
    callback?: (error: Error | null, result?: UploadResponse) => void
  ): Promise<UploadResponse> | void {
    if (!options?.filePath || typeof options.filePath !== "string") {
      throw new Error("filePath must be a string");
    }

    if (typeof callback === "function") {
      this._uploadApp(options, callback);
      return;
    }

    return new Promise<UploadResponse>((resolve, reject) => {
      this._uploadApp(options, (err, data) => {
        if (err) reject(err);
        else resolve(data!);
      });
    });
  }

  /**
   * 内部上传逻辑（完整三步）
   */
  private _uploadApp(
    uploadOptions: UploadOptions,
    callback: (error: Error | null, result?: UploadResponse) => void
  ) {
    const fileExt = uploadOptions.filePath.split(".").pop()?.toLowerCase();
    let buildType: "ios" | "android" | "harmony";

    switch (fileExt) {
      case "ipa":
        buildType = "ios";
        break;
      case "apk":
        buildType = "android";
        break;
      case "hap":
        buildType = "harmony";
        break;
      default:
        callback(
          new Error(
            `${this.LOG_TAG} Unsupported file type: ${fileExt}. Supported types: ipa, apk, hap`
          )
        );
        return;
    }

    const uploadTokenRequestData = querystring.stringify({
      ...uploadOptions,
      _api_key: this.apiKey,
      buildType,
    });

    uploadOptions.log && console.log(`${this.LOG_TAG} Checking API Key ...`);

    const uploadTokenRequest = https.request(
      {
        hostname: "api.pgyer.com",
        path: "/apiv2/app/getCOSToken",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(uploadTokenRequestData),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          callback(
            new Error(`${this.LOG_TAG} Service down: cannot get upload token.`)
          );
          return;
        }

        let responseData = "";
        response.on("data", (data) => (responseData += data.toString()));
        response.on("end", () => {
          try {
            const info = JSON.parse(responseData);
            if (info.code) {
              callback(
                new Error(
                  `${this.LOG_TAG} Service error: ${info.code}: ${info.message}`
                )
              );
              return;
            }
            this._uploadFile(uploadOptions, info, callback);
          } catch (err) {
            callback(err as Error);
          }
        });
      }
    );

    uploadTokenRequest.write(uploadTokenRequestData);
    uploadTokenRequest.end();
  }

  /**
   * Step 2 - 上传文件
   */
  private _uploadFile(
    uploadOptions: UploadOptions,
    uploadData: any,
    callback: (error: Error | null, result?: UploadResponse) => void
  ) {
    uploadOptions.log && console.log(`${this.LOG_TAG} Uploading app ...`);

    if (!fs.existsSync(uploadOptions.filePath)) {
      callback(new Error(`${this.LOG_TAG} filePath: file not exist`));
      return;
    }

    const statResult = fs.statSync(uploadOptions.filePath);
    if (!statResult.isFile()) {
      callback(new Error(`${this.LOG_TAG} filePath: not a file`));
      return;
    }

    const uploadForm = new FormData();
    log.info(JSON.stringify(uploadData.data,null,2))
    log.info(JSON.stringify(uploadOptions,null,2))
    uploadForm.append("signature", uploadData.data.params.signature);
    uploadForm.append(
      "x-cos-security-token",
      uploadData.data.params["x-cos-security-token"]
    );
    uploadForm.append("key", uploadData.data.params.key);
    uploadForm.append(
      "x-cos-meta-file-name",
      path.basename(uploadOptions.filePath)
    );
    uploadForm.append("file", fs.createReadStream(uploadOptions.filePath));
    axios.post(uploadData.data.endpoint, uploadForm, {
      headers: uploadForm.getHeaders(),
      maxBodyLength: Infinity
    }).then((res)=>{
      console.log(res.headers, res.status, res.statusText)
    }).catch((error)=>{
      console.log('[error]',error.message)
    })
    // uploadForm.submit(uploadData.data.endpoint, (err, res) => {
    //   if (err) {
    //     callback(err);
    //     return;
    //   }

    //   if (res?.statusCode === 204) {
    //     setTimeout(
    //       () => this._getUploadResult(uploadOptions, uploadData, callback),
    //       1000
    //     );
    //   } else {
    //     callback(
    //       new Error(`${this.LOG_TAG} Upload Error! Status ${res?.statusCode} ${res?.statusMessage}`)
    //     );
    //   }
    // });
  }

  /**
   * Step 3 - 查询上传结果
   */
  private _getUploadResult(
    uploadOptions: UploadOptions,
    uploadData: any,
    callback: (error: Error | null, result?: UploadResponse) => void
  ) {
    const requestBody = querystring.stringify({
      _api_key: this.apiKey,
      buildKey: uploadData.data.key,
    });

    const request = https.request(
      {
        hostname: "api.pgyer.com",
        path: "/apiv2/app/buildInfo",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          callback(new Error(`${this.LOG_TAG} Service down.`));
          return;
        }

        let responseData = "";
        response.on("data", (chunk) => (responseData += chunk.toString()));
        response.on("end", () => {
          try {
            const info: UploadResponse = JSON.parse(responseData);

            if (info.code === 1247) {
              uploadOptions.log &&
                console.log(
                  `${this.LOG_TAG} Parsing App Data ... retrying ...`
                );
              setTimeout(
                () =>
                  this._getUploadResult(uploadOptions, uploadData, callback),
                1000
              );
              return;
            }

            if (info.code) {
              callback(
                new Error(
                  `${this.LOG_TAG} Service error: ${info.code}: ${info.message}`
                )
              );
              return;
            }

            callback(null, info);
          } catch (err) {
            callback(err as Error);
          }
        });
      }
    );

    request.write(requestBody);
    request.end();
  }
}
