import { rimrafSync } from "rimraf";
import { resolve } from "path";
import { Task } from "../types";
import winston from "winston";
import dayjs from "dayjs";
import { parse } from "dotenv";
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
  if (ms < 0) ms = -ms;
  const time = {
    // day: Math.floor(ms / 86400000),
    // hour: Math.floor(ms / 3600000) % 24,
    m: Math.floor(ms / 60000) % 60,
    s: Math.floor(ms / 1000) % 60,
    // millisecond: Math.floor(ms) % 1000,
  };
  return Object.entries(time)
    .filter((val) => val[1] !== 0)
    .map(([key, val]) => `${val}${key}`)
    .join(" ");
};
