# CLI 使用说明

项目已提供短命令：

```bash
bun cli
```

查看总帮助：

```bash
bun cli -h
```

查看 `build` 帮助：

```bash
bun cli build --help
```

## 命令总览

### `init`

初始化数据库和 `hugo-aiv-app` 的 pipeline 记录。

```bash
bun cli init
```

### `resume <buildId>`

按某次失败构建继续执行。

- `buildId` 必填
- 支持完整 `buildId`
- 也支持 `buildId` 前缀，但如果匹配到多条记录，会提示你补更多位

```bash
bun cli resume petdwVMJkImB
```

### `retry <buildId> --task <taskName>`

从某次构建中的指定任务开始，重新执行后续步骤。

- `buildId` 必填
- `--task` 必填
- `--task` 必须是那次构建里已经成功执行过的任务

```bash
bun cli retry petdwVMJkImB --task uploadQiniu
```

### `build`

按 `app / env / branch / platform` 直接发起构建。

```bash
bun cli build --app hookAi --env production --branch main --platform android
```

也支持一条命令同时跑多个平台：

```bash
bun cli build --app hookAi --env production --branch main --platform ios,android
```

### `info <buildId> [--task <taskName>]`

查看某次构建详情。

- 不带 `--task` 时，会优先显示失败任务；如果没有失败任务，就显示最后一步
- 带上 `--task` 时，会显示指定任务的上下文

```bash
bun cli info petdwVMJkImB
bun cli info petdwVMJkImB --task uploadQiniu
```

### `log <buildId>`

查看某次构建日志，会自动定位 `logs` 里对应文件并使用 `tspin -p` 打开。

```bash
bun cli log petdwVMJkImB
```

说明：

- 需要本机已安装 `tailspin`（命令名是 `tspin`）
- 支持传入 `buildId` 前缀

### `history [--limit <number>]`

查看今天构建历史。

```bash
bun cli history
bun cli history --limit 10
bun cli history --filter platform=ios
bun cli history --filter platform=ios,env=alpha
```

说明：

- `--limit` 默认是 `10`
- `--filter` 支持 `key=value,key2=value2`；也支持重复传入 `--filter`
- 当前支持字段：`platform`、`env`、`branch`、`status`、`pipeId`、`projectName`、`buildId`

### `clear [--all] [--log]`

清理构建历史。默认只清理今天以前的数据；`--all` 清理全部。

```bash
bun cli clear --log
bun cli clear --all --log
```

说明：

- 默认行为（不加 `--all`）：只清理今天以前的历史记录
- `--log` 会同时删除对应日志文件

### `pipeline`

查看当前所有 pipeline。

```bash
bun cli pipeline
```

### `asc upload <buildId>`

把某次 iOS 构建产物上传到 App Store Connect。

```bash
bun cli asc upload <buildId>
```

## build 参数详解

### 必填参数

#### `--app <app>`

要构建的应用。

当前支持：

- `hookAi`

示例：

```bash
--app hookAi
```

#### `--env <env>`

要使用的环境配置。

当前支持：

- `alpha`
- `production`

示例：

```bash
--env alpha
--env production
```

#### `--branch <branch>`

要使用的代码分支。

当前支持：

- `alpha`
- `main`

示例：

```bash
--branch alpha
--branch main
```

#### `--platform <platforms>`

要构建的平台。

支持：

- 单个平台
- 多个平台，逗号分隔

当前支持的平台值：

- `android`
- `ios`

示例：

```bash
--platform android
--platform ios
--platform ios,android
```

说明：

- 多个平台会拆成多个 pipeline 顺序执行
- 平台值会自动去重
- 只要有一个平台值不合法，命令就会直接报错

### 可选通用参数

#### `--autoVersionCode`

是否自动递增 `versionCode`。

说明：

- 这是一个全局参数
- 会同时作用到这次命令里生成的所有 pipeline
- 现在沿用项目原有逻辑

示例：

```bash
bun cli build --app hookAi --env production --branch main --platform android --autoVersionCode
```

#### `--legacyVersioning`

是否启用旧版本号兼容逻辑。

说明：

- 这是一个全局参数
- 会同时作用到这次命令里生成的所有 pipeline

示例：

```bash
bun cli build --app hookAi --env production --branch main --platform android --legacyVersioning
```

### 平台专属参数

平台专属参数统一使用这种格式：

```bash
--平台:任务名.参数名 值
```

当前已支持：

#### `--android:buildAndroid.clear <boolean>`

传给 Android 的 `buildAndroid` 任务。

可选值：

- `true`
- `false`

含义：

- `true`：先执行 Android 构建前的清理，再构建
- `false`：跳过这次清理，直接构建

这个参数影响的是 Android 构建任务本身，不是别的步骤。

示例：

```bash
bun cli build --app hookAi --env production --branch main --platform android --android:buildAndroid.clear false
```

如果一条命令同时跑多个平台：

```bash
bun cli build --app hookAi --env production --branch main --platform ios,android --android:buildAndroid.clear false
```

说明：

- 这个参数只对 `android` 生效
- `ios` 会忽略它

#### `--ios:buildIOS.podInstall <boolean>`

传给 iOS 的 `buildIOS` 任务。

可选值：

- `true`
- `false`

含义：

- `true`：强制执行 `pod install`
- `false`：按需执行 `pod install`

不传时：

- 按需执行 `pod install`（`Podfile.lock` 与 `Pods/Manifest.lock` 不一致时才执行）

示例：

```bash
bun cli build --app hookAi --env production --branch main --platform ios --ios:buildIOS.podInstall false
bun cli build --app hookAi --env production --branch main --platform ios --ios:buildIOS.podInstall true
```

#### `--ios:buildIOS.provisioningAuto <boolean>`

传给 iOS 的 `buildIOS` 任务，控制导出阶段是否自动更新签名资源和注册设备。

可选值：

- `true`
- `false`

含义：

- `true`：导出时允许自动签名更新和设备注册（按需开启）
- `false`：导出时关闭自动签名更新和设备注册

示例：

```bash
bun cli build --app hookAi --env production --branch main --platform ios --ios:buildIOS.provisioningAuto false
```

## 常见命令示例

### Android 正式包

```bash
bun cli build --app hookAi --env production --branch main --platform android
```

### 同时构建 iOS 和 Android

```bash
bun cli build --app hookAi --env production --branch main --platform ios,android
```

### Android 直接构建，不先清理

```bash
bun cli build --app hookAi --env production --branch main --platform android --android:buildAndroid.clear false
```

### 查看最近 20 条历史

```bash
bun cli history --limit 20
```

### 查看某次构建的某个任务详情

```bash
bun cli info petdwVMJkImB --task uploadQiniu
```

## 当前规则

- 必填参数缺失时，命令会直接报错
- 不会因为缺参数而弹选择框
- `build` 当前只支持 `hookAi`
- 平台专属参数只会传给对应平台和对应任务
- `resume` 和 `retry` 会继承这次构建保存下来的相关参数
