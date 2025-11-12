import { buildConfig } from "./utils/zodSchemas";

const config = buildConfig({
  gitUri: "xxx.git",
  pgyer: {
    apiKey: "xxx",
    buildType: "apk" as const,
  },
  notifyBusinessWechat: {
    webhook: "xxx",
  },
  fir: { apiKey: "xxx" },
  uploadApi: { alpha: "", prod: "" },
  updateUrl: { alpha: "", prod: "" },
});

export default config;
