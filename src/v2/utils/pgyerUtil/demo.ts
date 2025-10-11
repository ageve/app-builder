import { PGYERAppUploader } from "./PGYERAppUploader"; // 若使用 .ts，请改为 './PGYERAppUploader'

const uploader = new PGYERAppUploader("<your_api_key>");

async function main() {
  try {
    const result = await uploader.upload({
      filePath: "./app.apk",
      log: true,
      buildInstallType: 2,
      buildPassword: "123456",
    });

    console.log("✅ 上传成功:", result);
  } catch (error) {
    console.error("❌ 上传失败:", error);
  }
}

main();
