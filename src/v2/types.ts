export type Task = (context: any) => Promise<boolean | unknown>;
export type TaskMeta = { name: string; task: Task };
export type Hooks = {
  beforeInitial?: (context: any) => {};
};
export type Options = {
  branch: string;
  gitUri: string;
  workspace?: string;
};
export type Context = Options & Record<string, unknown>;

export interface FetchTokenParams {
  apiToken: string;
  platform: string;
  packageName: string;
}

export type FirTokenResult = {
  url: string;
  key: string;
  token: string;
};

export type UploadFirParams = FirTokenResult & {
  platform: "iOS" | "android";
  appName: string;
  versionName: string;
  versionCode: string;
  filepath: string;
};

export type Platform = "iOS" | "android";

export type GetCorsTokenParams = { apiKey: string; buildType: "ipa" | "apk" };

export type PgyerTokenResult = any;

export type UploadPgyerData = {
  productFile: string;
  filename?: string;
};
