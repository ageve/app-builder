export function verifyToken(
  request: Request,
  expectedToken: string,
): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ", 2);
  return scheme === "Bearer" && token === expectedToken;
}
