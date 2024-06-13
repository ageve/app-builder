import Pipeline from "./pipeline";

// 串行执行
export async function pipelineRun(pipelines: Pipeline[]) {
  for (const pipeline of pipelines) {
    try {
      await pipeline.run();
    } catch (error) {}
  }
}

// 并行执行
export async function pipelineRunParallel(pipelines: Pipeline[]) {
  Promise.allSettled(pipelines.map((item) => item.run));
}
