import { resolve } from "path";
import { cwd } from "process";
import Pipeline from "./pipeline";
import { pipelineRun } from "./pipelineRun";
import createPrepareEnv from "./tasks/prepareEnv";

const uiLibRelease = new Pipeline(
  {
    gitUri: "git@github.com:darshanpawar101/Coffee-Shop-App.git",
    branch: "main",
  },
  // UPDATE: 用 serial 或 parallel 组合 tasks
  [
    // prepareCode,
    // prepareDependencies,
    createPrepareEnv(resolve(cwd(), "./envs/hugo-game-app/.env.alpha")),
    // buildAndroid,
    // tasksParallel([createUploadFir('','android'), uploadQiniu]),
    // createUploadPgyer({
    //   apiKey: "58d6056c6533a8459dfb775b4b8018a5",
    //   buildType: "apk",
    // }),
    // createNotifyBusinessWechat(
    //   "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=00c101bd-ece1-4f9a-8b0d-075260591982"
    // ),
  ]
);

// app1,
pipelineRun([uiLibRelease]);

// app2,

// app3,

// app1, app2, app3
