# BurgerAPI Ecosystem

Official extensions for BurgerAPI. Structure:

```
ecosystem/
├── hooks/      # Reusable request lifecycle hooks
├── plugins/    # Application extensions (auth, env, …)
└── skills/     # AI agent skills
```

| Folder | Role |
|--------|------|
| **hooks/** | Small factories for the request lifecycle (CORS, logger, rate-limit, compression, …). Compose in `src/hooks.ts` or route `hooks.ts`. |
| **plugins/** | Larger integrations (JWT, session, API key, OIDC, env validation, …). Register via `src/plugins.ts` + `burger.usePlugin()`. May register hooks and providers. |
| **skills/** | AI agent skills for BurgerAPI projects. |

**Hooks** control request execution. **Plugins** extend the application. They are separate concepts.

---

## Recommended app structure

```
my-app/
├── burger.build.ts
├── src/
│   ├── index.ts
│   ├── plugins.ts
│   ├── providers.ts
│   ├── hooks.ts
│   └── api/
│       └── users/
│           ├── route.ts
│           ├── schema.ts
│           ├── hooks.ts
│           ├── openapi.ts
│           └── config.ts
├── ecosystem/
│   ├── hooks/
│   └── plugins/
└── .agents/skills/burger-api/
```

Route directories are self-contained (no group inheritance). Convention files: `route.ts`, `schema.ts`, `hooks.ts`, `openapi.ts`, `config.ts`.

---

## Install via CLI

```bash
burger-api add cors      # → ecosystem/hooks/
burger-api add jwt       # → ecosystem/plugins/ (when published as plugin)
burger-api list
burger-api skills install
```

---

## Hooks example

```ts
// src/hooks.ts
import { cors } from "../ecosystem/hooks/cors/cors";
import { logger } from "../ecosystem/hooks/logger/logger";

export const onRequest = [logger(), cors({ origin: "*" })];
```

Target hook names (vision): `onRequest`, `transform`, `beforeRoute`, `afterRoute`, `mapResponse`, `onError`.  
Legacy code may still use older names until the core migrates.

---

## Plugins example (auth)

Authentication is implemented through official ecosystem **plugins** that integrate with BurgerAPI’s hook system (`transform` + `beforeRoute`) and route `config.ts`. The framework core is auth-agnostic.

```ts
// src/plugins.ts
import { jwt } from "../ecosystem/plugins/jwt";

export default (burger) => {
  burger.usePlugin(jwt({ secret: process.env.JWT_SECRET }));
};

// api/public/health/config.ts
export default { auth: false };
```

---

## See also

- Vision: [`../../BURGERAPI_VISION.md`](../../BURGERAPI_VISION.md)
- Individual packages under `hooks/*` and `plugins/*`
- Skills: `skills/burger-api/`
