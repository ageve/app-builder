# APP 打包构建脚本

## 配置

### 配置 config.ts

1. 将 `src/config.example.ts` 重命名 `src/config.ts`，然后修改对应的配置。

```ts
const config = {
  // gitUir: "xxx/hugo/hugo-game-app.git", // 代码仓库
  pgyer: {
    // 上传 蒲公英分发网站的 apiKey （目前用于 debug 调试）
    apiKey: "xxx",
    buildType: "apk" as const,
  },
  notifyBusinessWechat: {
    // 构建上传完成以后通知企业微信的 webhook 网址
    webhook: "xxx",
  },
  fir: { apiKey: "xxx" }, // fir.im 分发网站的 apiKey （用于正式版分发）
  uploadApi: { alpha: "", prod: "" }, // 上传七牛存储的 api 地址，包含测试和正式
  updateUrl: { alpha: "", prod: "" }, // 更新后台里包管理信息，用于应用内版本更新
};

export default config;
```

2. 在 `src/cli/[projectName]` 下新建 config.ts
   关于配置

- 蒲公英分发网站: https://www.pgyer.com/account/api
- fir.im 分发网址：https://www.betaqr.com.cn/apps

### 配置项目 .env 文件

根目录下新建 envs 目录，根据项目新建对应环境配置文件
.
├── hugo-aiv-app
│   ├── .env.alpha
│   └── .env.production
└── hugo-game-app

## 运行

运行前确保本机已安装 [bun](https://bun.sh/) 运行环境。

```shell
bun run src/cli/main.ts
```
