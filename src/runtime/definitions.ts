import { StepDefinition, StepId } from "./types";

export const stepDefinitions: Record<StepId, StepDefinition> = {
  resolve_config: {
    stepId: "resolve_config",
    displayName: "Resolve Config",
    retryable: true,
    checkpointable: true,
    dependsOn: [],
  },
  prepare_code: {
    stepId: "prepare_code",
    displayName: "Prepare Code",
    retryable: true,
    checkpointable: true,
    dependsOn: ["resolve_config"],
  },
  prepare_dependencies: {
    stepId: "prepare_dependencies",
    displayName: "Prepare Dependencies",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_code"],
  },
  prepare_variables: {
    stepId: "prepare_variables",
    displayName: "Prepare Variables",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_code"],
  },
  prepare_env: {
    stepId: "prepare_env",
    displayName: "Prepare Env",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_variables"],
  },
  prepare_platform_env: {
    stepId: "prepare_platform_env",
    displayName: "Prepare Platform Env",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_env"],
  },
  build_android: {
    stepId: "build_android",
    displayName: "Build Android",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_dependencies", "prepare_platform_env"],
  },
  build_ios: {
    stepId: "build_ios",
    displayName: "Build iOS",
    retryable: true,
    checkpointable: true,
    dependsOn: ["prepare_dependencies", "prepare_platform_env"],
  },
  post_build_local: {
    stepId: "post_build_local",
    displayName: "Post Build Local",
    retryable: true,
    checkpointable: true,
    dependsOn: [],
  },
  upload_distribution: {
    stepId: "upload_distribution",
    displayName: "Upload Distribution",
    retryable: true,
    checkpointable: true,
    dependsOn: [],
  },
  finalize_logs: {
    stepId: "finalize_logs",
    displayName: "Finalize Logs",
    retryable: true,
    checkpointable: true,
    dependsOn: [],
  },
};

export function getOrderedStepsForPlatform(platform: "android" | "iOS"): StepId[] {
  const buildStep = platform === "android" ? "build_android" : "build_ios";
  return [
    "resolve_config",
    "prepare_code",
    "prepare_dependencies",
    "prepare_variables",
    "prepare_env",
    "prepare_platform_env",
    buildStep,
    "post_build_local",
    "upload_distribution",
    "finalize_logs",
  ];
}
