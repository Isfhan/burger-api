# Security Headers Hook

Adds security headers to responses: CSP, HSTS, `X-Frame-Options`, and more.

## Features

- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`
- `Referrer-Policy` and `Permissions-Policy`
- Strict and relaxed presets
- Every header can be turned off with `false`

## Installation

```bash
burger-api add security-headers
```

## Usage

The hook returns a response transform, so wire it into `beforeRoute`.

```typescript
// src/hooks.ts
import { securityHeaders } from '../ecosystem/hooks/security-headers/security-headers';

export const beforeRoute = [securityHeaders()];
```

### Presets

```typescript
import { strictSecurity, relaxedSecurity } from '../ecosystem/hooks/security-headers/security-headers';

const isDev = process.env.NODE_ENV === 'development';

export const beforeRoute = [
    isDev ? relaxedSecurity() : strictSecurity(),
];
```

- `strictSecurity()`: restrictive CSP (`'self'` only), 2-year HSTS with
  `includeSubDomains` and `preload`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, and camera, microphone, geolocation, and
  payment disabled.
- `relaxedSecurity()`: no CSP, no HSTS, `X-Frame-Options: SAMEORIGIN`, and
  `X-XSS-Protection: 1; mode=block`.

### Custom CSP

Directive keys are camelCase and become kebab-case directives
(`defaultSrc` becomes `default-src`):

```typescript
export const beforeRoute = [
    securityHeaders({
        contentSecurityPolicy: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.example.com'],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://api.example.com'],
        },
    }),
];
```

### Disable specific headers

```typescript
export const beforeRoute = [
    securityHeaders({
        contentSecurityPolicy: false, // no CSP
        xssProtection: false,
    }),
];
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `contentSecurityPolicy` | `Record<string, string[]> \| false` | - | CSP directives; not set by default |
| `strictTransportSecurity` | `{ maxAge?, includeSubDomains?, preload? } \| false` | `{ maxAge: 31536000, includeSubDomains: true }` | HSTS |
| `frameOptions` | `'DENY' \| 'SAMEORIGIN' \| false` | `'DENY'` | `X-Frame-Options` |
| `contentTypeOptions` | `'nosniff' \| false` | `'nosniff'` | `X-Content-Type-Options` |
| `xssProtection` | `'0' \| '1' \| '1; mode=block' \| false` | `'1; mode=block'` | `X-XSS-Protection` |
| `referrerPolicy` | `'no-referrer' \| 'no-referrer-when-downgrade' \| 'origin' \| 'origin-when-cross-origin' \| 'same-origin' \| 'strict-origin' \| 'strict-origin-when-cross-origin' \| 'unsafe-url' \| false` | `'no-referrer'` | `Referrer-Policy` |
| `permissionsPolicy` | `Record<string, string[]> \| false` | - | Feature policy; an empty list disables the feature |
| `dnsPrefetchControl` | `'on' \| 'off' \| false` | `'off'` | `X-DNS-Prefetch-Control` |
| `downloadOptions` | `'noopen' \| false` | `'noopen'` | `X-Download-Options` |
| `permittedCrossDomainPolicies` | `'none' \| 'master-only' \| 'by-content-type' \| 'by-ftp-filename' \| 'all' \| false` | `'none'` | `X-Permitted-Cross-Domain-Policies` |

Example `permissionsPolicy`:

```typescript
permissionsPolicy: {
    camera: [],               // camera=()
    geolocation: ['self'],    // geolocation=(self)
},
```

## Notes

- HSTS only has an effect over HTTPS.
- Prefer CSP over `X-XSS-Protection`; modern browsers ignore the latter.
- Test CSP with the browser console before enforcing it.