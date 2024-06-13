```ts
type Context<T extends Record<string, unknown>> = Global & T;

Context;

Context<Env>;

Context<Env & Build>;

Context<Env & Build & Variables>;
```
