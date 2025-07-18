import { Task } from "../types";
import { setTaskName } from "../utils/common";

async function execTasksParallel(context: any, tasks: Task[]) {
  const result = await Promise.allSettled(
    tasks.map(async (task) => {
      const result = await task(context);
      if (result && task.name) {
        if (typeof result === "object") {
          context[task.name] = result;
        }
      }
    })
  );
  // NOTE:有一个子失败则任务失败；保留 context 重新执行
  return !result.some((it) => {
    it.status === "rejected";
  });
}

export default function tasksParallel(tasks: Task[]) {
  const task = (context: any) => execTasksParallel(context, tasks);
  setTaskName("tasksParallel", task);
  return task;
}
