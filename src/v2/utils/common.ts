import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { parse } from "dotenv";
import { rimrafSync } from "rimraf";
import winston from "winston";
import { Task } from "../types";
dayjs.extend(duration);
export function setTaskName(name: string, prepareWorkspace: Task) {
  Object.defineProperties(prepareWorkspace, {
    name: {
      value: name,
    },
  });
}

export const createLogger = ({
  filename,
  clean = true,
}: {
  filename: string;
  clean?: boolean;
}) => {
  clean && rimrafSync(filename);
  return winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [
      new winston.transports.File({
        filename,
        level: "info",
      }),
    ],
  });
};

export function getFormatDateForRecord() {
  return dayjs().format("YYYYMMDD");
}

export function dotEnvToJson(data: string) {
  return parse(data);
}

export function jsonToDotEnv(data: Record<string, string>) {
  const env = Object.entries(data)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return env;
}

export const formatRunningTime = (ms: number) => {
  return dayjs.duration(ms).format("mm:ss SSS");
};

export function convertExpoPublicKey(key: string): string {
  const prefix = "EXPO_PUBLIC_";
  let stripped = key.startsWith(prefix) ? key.slice(prefix.length) : key;

  // 转成小写单驼峰
  const parts = stripped.toLowerCase().split("_");
  return parts
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}
