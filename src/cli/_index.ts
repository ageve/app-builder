import Enquirer from "enquirer";
import { buildHugoGameApp } from "./hugo-game/buildHugoGameApp";
const enquirer = new Enquirer<{ project: string }>();

/**
 * @deprecated
 */
async function main() {
  try {
    const result = await enquirer.prompt({
      type: "select",
      name: "project",
      message: "select a project",
      choices: ["hugo-game-app"],
    });

    if (result.project === "hugo-game-app") {
      buildHugoGameApp();
    } else {
      console.log(result.project + "：构建脚本未配置");
    }
  } catch (error) {
    console.error(error);
  }
}

main();
