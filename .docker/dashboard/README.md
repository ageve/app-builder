## Dashboard Docker Dev

This compose stack runs the lightweight dashboard and runtime server inside Linux containers so DuckDB can use container-native bindings instead of the host machine's Node/Bun native module setup.

### Start

```sh
docker compose -f .docker/dashboard/docker-compose.yml up --build
```

Then start the native executor on the host machine:

```sh
bun run executor
```

### Stop

```sh
docker compose -f .docker/dashboard/docker-compose.yml down
```

### Notes

- The repo is mounted into `/workspace/app-builder`.
- DuckDB remains an embedded database and writes to `/workspace/app-builder/.data/app-builder.duckdb`.
- `app-builder-runtime` exposes the state/data API on port `4001`.
- Run the real executor on the host machine so `git`, Android SDK, Xcode, signing, and other local tools stay in the native environment.
- Docker services no longer execute `git clone`, Gradle, or Xcode commands.
- `dashboard` talks to the runtime server over HTTP instead of touching DuckDB directly.
- If you want the dashboard bound to a different port, change the `3000:3000` mapping.
- The compose file pins `npm` registry env vars to `https://registry.npmjs.org/` to avoid mirror-specific 404s during container installs.
- Web and runtime services use separate `node_modules` volumes so two concurrent `bun install` processes do not race on the same dependency tree.
