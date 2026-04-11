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

命令行模式请看：

- [CLI.md](/Users/ben/Documents/workspace/business/app-builder/CLI.md)

### CLI 快速上手

查看帮助：

```bash
bun cli -h
```

最常用的几个命令：

```bash
bun cli init
bun cli history --limit 10
bun cli clear --log
bun cli info petdwVMJkImB
bun cli log petdwVMJkImB
bun cli resume petdwVMJkImB
bun cli retry petdwVMJkImB --task uploadQiniu
```

直接发起构建：

```bash
bun cli build --app hookAi --env production --branch main --platform android
```

同时构建多个平台：

```bash
bun cli build --app hookAi --env production --branch main --platform ios,android
```

Android 跳过清理直接构建：

```bash
bun cli build --app hookAi --env production --branch main --platform android --android:buildAndroid.clear false
```

清理历史并同时清理对应日志：

```bash
bun cli clear --log
bun cli clear --all --log
```

`build` 当前规则：

- 必填参数：`--app`、`--env`、`--branch`、`--platform`
- `--platform` 支持多个值，逗号分隔，例如 `ios,android`
- 平台专属参数格式：`--平台:任务名.参数名 值`
- 当前已支持：
  - `--android:buildAndroid.clear false`
  - `--ios:buildIOS.podInstall true|false`（`true` 强制，`false`/不传按需）
  - `--ios:buildIOS.provisioningAuto true|false`（默认 `false`，按需开启）
- 清理历史：`bun cli clear --log`（默认清理今天以前，并删对应日志）
- 全量清理：`bun cli clear --all --log`
- 缺少必填参数时会直接报错，不会弹选择框

## 版本管理策略

构建系统使用基于语义化版本和 git 提交信息的自动版本管理策略。

### 版本号格式 (Version Code)

版本号是从语义化版本生成的纯数字：

- **格式**: `major * 1000000 + minor * 1000 + patch`
- **范围**: 各组件支持 0-999
- **示例**:
  - `1.0.0` → `1000000`
  - `1.1.2` → `1001002`
  - `2.15.999` → `2015999`

### 版本名格式 (Version Name)

版本名结合语义化版本和构建号：

- **格式**: `{major}.{minor}.{patch}.{buildNumber}`
- **构建号**: 来自 git 提交数量
- **示例**:
  - `1.0.0.127` (版本 1.0.0，提交数 127)
  - `1.1.2.245` (版本 1.1.2，提交数 245)

### 向后兼容性

系统通过向后兼容支持旧项目：

#### 传统模式（向后兼容）

- 如果 `.env` 文件中存在 `EXPO_PUBLIC_VERSION_NAME`，将直接使用该值
- 不进行自动版本生成
- 保持旧项目的现有行为

#### 新模式（自动生成）

- 如果 `EXPO_PUBLIC_VERSION_NAME` 缺失或为空，自动生成版本名
- 使用新格式：`{major}.{minor}.{patch}.{commitCount}`
- 提供一致、可预测的版本管理

### 迁移指南

从传统版本管理迁移到自动版本管理：

1. **删除** `.env` 文件中的 `EXPO_PUBLIC_VERSION_NAME`
2. **确保** `EXPO_PUBLIC_VERSION_CODE` 设置正确（如 `1001002` 对应版本 1.1.2）
3. **测试** 构建流程以验证版本名生成正确

### 版本号递增策略

- **生产环境**: 默认自动递增版本号
- **非生产环境**: 默认不递增版本号，保持原有版本
- **手动控制**: 可通过参数显式指定是否递增版本号

这样可以避免开发和测试构建时版本号不必要的递增，只在正式发布时递增版本号。

### 环境变量

- `EXPO_PUBLIC_VERSION_CODE`: 必需。代表语义化版本的纯数字
- `EXPO_PUBLIC_VERSION_NAME`: 可选。存在时覆盖自动生成（传统模式）
