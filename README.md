
# APP 打包构建脚本

## 配置
将 `src/config.example.ts` 重命名 `src/config.ts`，然后修改对应的配置。

```ts
const config = {
  gitUir: "xxx/hugo/hugo-game-app.git", // 代码仓库
  pgyer: { // 上传 蒲公英分发网站的 apiKey （目前用于 debug 调试）
    apiKey: "xxx",
    buildType: "apk" as const,
  },
  notifyBusinessWechat: { // 构建上传完成以后通知企业微信的 webhook 网址
    webhook: "xxx",
  },
  fir: { apiKey: "xxx" }, // fir.im 分发网站的 apiKey （用于正式版分发）
  uploadApi: { alpha: "", prod: "" }, // 上传七牛存储的 api 地址，包含测试和正式
  updateUrl: { alpha: "", prod: "" }, // 更新后台里包管理信息，用于应用内版本更新
};

export default config;

```

关于配置
- 蒲公英分发网站: https://www.pgyer.com/account/api
- fir.im 分发网址：https://www.betaqr.com.cn/apps

## 运行

推荐使用 `bun run src/cli/index.ts` 。运行前确保本机已安装 [bun](https://bun.sh/) 运行环境。

脚本使用 typescript 编写，可以使用 `ts-node` 或 `bun` 等支持运行 typescript 的环境来直接运行。或者使用 `tsc` 编译后运行。
