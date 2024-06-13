import Enquirer from "enquirer";
import interactive from "./interactive/hugo-game-app";
const enquirer = new Enquirer<{ project: string }>();

async function main() {
  try {
    const result = await enquirer.prompt({
      type: "select",
      name: "project",
      message: "select a project",
      choices: ["hugo-game-app"],
    });

    if (result.project === "hugo-game-app") {
      interactive();
    } else {
      console.log(result.project + "：构建脚本未配置");
    }
  } catch (error) {
    console.error(error);
  }
}

main();
