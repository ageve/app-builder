export function cartesian3<A, B, C>(a: A[], b: B[], c: C[]): [A, B, C][] {
  return a.flatMap((x) =>
    b.flatMap((y) => c.map((z) => [x, y, z] as [A, B, C]))
  );
}

export function firstMatch<T>(
  rules: { condition: boolean; value: T }[],
  defaultValue: T
): T {
  return rules.find((r) => r.condition)?.value ?? defaultValue;
}

export function cartesian4<A, B, C, D>(
  a: A[],
  b: B[],
  c: C[],
  d: D[]
): [A, B, C, D][] {
  return a.flatMap((x) =>
    b.flatMap((y) =>
      c.flatMap((z) => d.map((w) => [x, y, z, w] as [A, B, C, D]))
    )
  );
}
