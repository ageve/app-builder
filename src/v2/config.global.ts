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
    prod: "https://hugoapi.ctssvc.com/storage/upload",
  },
  uploadToken: {
    alpha:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Mjk3Mjc2fQ.fgndh_mLjOpk34-bZoSbHXVWTetD3wUR9ZH-wiREZzY",
    prod: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTUyMDY2Njd9.HWBp7Yx3kIjtwgS7NTthhZdmhQ7-d1llwXcEUYOQkNc",
  },
  updateUrl: { alpha: "", prod: "" },
});

export default config;
