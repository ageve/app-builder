// version-code.ts
/**
 * 将整数 versionCode (例如 101002) 转为语义化字符串 "major.minor.patch"
 */
export function versionCodeToSemver(versionCode: number): string {
  if (!Number.isInteger(versionCode) || versionCode < 0) {
    throw new TypeError("versionCode must be a non-negative integer");
  }

  const major = Math.floor(versionCode / 100_000);
  const minor = Math.floor((versionCode % 100_000) / 1_000);
  const patch = versionCode % 1000;

  return `${major}.${minor}.${patch}`;
}

/**
 * 将语义化版本 "major.minor.patch" 转为整数 versionCode
 */
export function semverToVersionCode(semver: string): number {
  if (typeof semver !== "string") {
    throw new TypeError('semver must be a string like "1.2.3"');
  }

  const parts = semver.split(".").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) {
    throw new Error('semver must be "major.minor" or "major.minor.patch"');
  }

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = parts.length === 3 ? Number(parts[2]) : 0;

  if (!Number.isInteger(major) || major < 0) {
    throw new Error("major must be a non-negative integer");
  }
  if (!Number.isInteger(minor) || minor < 0 || minor > 99) {
    throw new Error("minor must be in range 0..99");
  }
  if (!Number.isInteger(patch) || patch < 0 || patch > 999) {
    throw new Error("patch must be in range 0..999");
  }

  return major * 100_000 + minor * 1_000 + patch;
}

// tool
// console.log("versionCode", semverToVersionCode("10.1.1"));
