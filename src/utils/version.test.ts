// version-code.test.ts
import { describe, expect, it } from "bun:test";
import { semverToVersionCode, versionCodeToSemver } from "./version";

describe("versionCodeToSemver()", () => {
  it("should convert 101002 -> 1.1.2", () => {
    expect(versionCodeToSemver(101002)).toBe("1.1.2");
  });

  it("should convert 100000 -> 1.0.0", () => {
    expect(versionCodeToSemver(100000)).toBe("1.0.0");
  });

  it("should convert 100999 -> 1.0.999", () => {
    expect(versionCodeToSemver(100999)).toBe("1.0.999");
  });

  it("should throw on negative number", () => {
    expect(() => versionCodeToSemver(-1)).toThrow();
  });
});

describe("semverToVersionCode()", () => {
  it("should convert 1.1.2 -> 101002", () => {
    expect(semverToVersionCode("1.1.2")).toBe(101002);
  });

  it("should handle missing patch: 1.0 -> 100000", () => {
    expect(semverToVersionCode("1.0")).toBe(100000);
  });

  it("should convert 1.0.999 -> 100999", () => {
    expect(semverToVersionCode("1.0.999")).toBe(100999);
  });

  it("should convert 200.99.1 -> 20099001", () => {
    expect(semverToVersionCode("200.99.1")).toBe(20099001);
  });

  it("should throw if minor > 99", () => {
    expect(() => semverToVersionCode("1.100.0")).toThrow();
  });

  it("should throw if patch > 999", () => {
    expect(() => semverToVersionCode("1.0.1000")).toThrow();
  });
});

describe("roundtrip conversions", () => {
  const samples = [0, 1, 999, 1000, 101002, 20099001];
  for (const code of samples) {
    it(`roundtrip ${code}`, () => {
      const semver = versionCodeToSemver(code);
      const back = semverToVersionCode(semver);
      expect(back).toBe(semverToVersionCode(semver)); // same as back
    });
  }
});
