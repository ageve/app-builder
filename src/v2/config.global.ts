import { buildConfig } from "@/utils/zodSchemas";

const config = buildConfig({
  gitUri: "xxx/hugo/hugo-game-app.git",
  pgyer: {
    apiKey: "xxx",
    buildType: "apk" as const,
  },
  notifyBusinessWechat: {
    webhook: "xxx",
  },
  fir: { apiKey: "xxx" },
  uploadApi: {
    alpha: "https://hugoapia.yocdev.com/storage/upload",
    prod: "https://hugoapia.yocdev.com/storage/upload",
  },
  updateUrl: { alpha: "", prod: "" },
});

export default config;
