import { PGYERAppUploader } from "./PGYERAppUploader"; // 若使用 .ts，请改为 './PGYERAppUploader'

const uploader = new PGYERAppUploader("");

async function main() {
  try {
    const result = await uploader.upload({
      filePath: "",
      log: true,
    });

    console.log("✅ 上传成功:", result);
  } catch (error) {
    console.error("❌ 上传失败:", error);
  }
}

main();
