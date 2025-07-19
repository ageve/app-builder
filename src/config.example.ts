const config = {
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
  pkgManager: "bun", // yarn , npm ,pnpm
};

export default config;
