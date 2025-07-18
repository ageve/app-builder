export function cartesian3<A, B, C>(a: A[], b: B[], c: C[]): [A, B, C][] {
  return a.flatMap((x) =>
    b.flatMap((y) => c.map((z) => [x, y, z] as [A, B, C]))
  );
}
