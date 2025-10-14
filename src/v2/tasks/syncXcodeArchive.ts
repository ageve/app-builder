// Target: 让 buildIOS 打包出来的 Archive 出现在 Xcode Organizer 列表里

import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { cpSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { setTaskName } from "../utils/common";

type Options = { schema: string };

async function syncArchive(context: any, options: Options) {
  try {
    const { buildIOS } = context;
    const { archiveFile } = buildIOS;
    const { schema } = options;

    // 检查 archiveFile 是否存在
    if (!archiveFile || !existsSync(archiveFile)) {
      log.error(`Archive 文件不存在: ${archiveFile}`);
      return false;
    }

    // 使用 dayjs 获取当前日期和时间
    const now = dayjs();
    const dateStr = now.format("YYYY-MM-DD"); // 格式: YYYY-MM-DD
    const timeStr = now.format("HH.mm"); // 格式: HH.mm

    // 构建 Xcode Archives 目录路径
    const xcodeArchivesDir = join(
      homedir(),
      "Library",
      "Developer",
      "Xcode",
      "Archives",
      dateStr
    );

    // 创建日期目录（如果不存在）
    if (!existsSync(xcodeArchivesDir)) {
      mkdirSync(xcodeArchivesDir, { recursive: true });
      log.info(`创建目录: ${xcodeArchivesDir}`);
    }

    // 构建目标文件名，遵循 Xcode 命名规则: "SchemaName YYYY-MM-DD, HH.mm.xcarchive"
    const targetArchiveName = `${schema} ${dateStr}, ${timeStr}.xcarchive`;
    const targetArchivePath = join(xcodeArchivesDir, targetArchiveName);

    // 复制 archive 文件
    log.info(`源文件: ${archiveFile} => 目标路径: ${targetArchivePath}`);

    cpSync(archiveFile, targetArchivePath);

    log.success(`Archive 已同步到 Xcode Organizer`);
    log.info(`可以在 Xcode -> Window -> Organizer 中查看`);

    return true;
  } catch (error) {
    log.error("[syncArchive] 失败");
    console.log(error);
    return false;
  }
}

export default function createSyncArchive(options: Options) {
  const task = (context: any) => syncArchive(context, options);
  setTaskName("syncArchive", task);
  return task;
}
