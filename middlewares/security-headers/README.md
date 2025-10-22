# Security Headers Middleware

Security headers middleware for burger-api framework. This middleware adds various security-related HTTP headers to protect your application from common web vulnerabilities like XSS, clickjacking, and more.

## Features

- ✅ Content Security Policy (CSP)
- ✅ HTTP Strict Transport Security (HSTS)
- ✅ X-Frame-Options (clickjacking protection)
- ✅ X-Content-Type-Options (MIME sniffing protection)
- ✅ X-XSS-Protection (XSS filtering)
- ✅ Referrer-Policy
- ✅ Permissions-Policy (feature control)
- ✅ Multiple other security headers
- ✅ Preset configurations (strict/relaxed)
- ✅ Fully configurable

## Installation

Copy this middleware into your project:

```bash
# Using the burger-api CLI (coming soon)
burger-api add security-headers

# Or manually copy the security-headers.ts file to your middleware folder
```

## Usage

### Basic Usage (Default Security)

```typescript
import { Burger } from 'burger-api';
import { securityHeaders } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders() // Applies default security headers
    ]
});

app.serve(3000);
```

### Strict Security (Production Recommended)

```typescript
import { strictSecurity } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        strictSecurity() // Applies strict security settings
    ]
});
```

### Relaxed Security (Development)

```typescript
import { relaxedSecurity } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        relaxedSecurity() // Less restrictive for development
    ]
});
```

### Custom Content Security Policy

```typescript
import { securityHeaders } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders({
            contentSecurityPolicy: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.example.com"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: ["'self'", "https://api.example.com"]
            }
        })
    ]
});
```

### Custom HSTS Configuration

```typescript
import { securityHeaders } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders({
            strictTransportSecurity: {
                maxAge: 63072000, // 2 years
                includeSubDomains: true,
                preload: true // Submit to HSTS preload list
            }
        })
    ]
});
```

### Disable Specific Headers

```typescript
import { securityHeaders } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders({
            contentSecurityPolicy: false, // Disable CSP
            xssProtection: false, // Disable X-XSS-Protection
            frameOptions: false // Disable X-Frame-Options
        })
    ]
});
```

## Configuration Options

### `contentSecurityPolicy`

- **Type**: `Record<string, string[]> | false`
- **Default**: `undefined` (not set)

Controls which resources the browser is allowed to load. This is one of the most powerful security features.

**Common Directives:**

```typescript
{
  defaultSrc: ["'self'"],              // Default policy for all resources
  scriptSrc: ["'self'", "https://cdn.example.com"], // JavaScript sources
  styleSrc: ["'self'", "'unsafe-inline'"], // CSS sources
  imgSrc: ["'self'", "data:", "https:"], // Image sources
  fontSrc: ["'self'", "https://fonts.gstatic.com"], // Font sources
  connectSrc: ["'self'", "https://api.example.com"], // fetch/XHR/WebSocket
  frameSrc: ["'none'"],                // iframe sources
  objectSrc: ["'none'"],               // <object>, <embed>, <applet>
  baseUri: ["'self'"],                 // <base> tag
  formAction: ["'self'"]               // Form submissions
}
```

**Special Values:**
- `'self'`: Same origin
- `'none'`: Block all
- `'unsafe-inline'`: Allow inline scripts/styles (not recommended)
- `'unsafe-eval'`: Allow eval() (not recommended)
- `data:`: Allow data: URIs
- `https:`: Allow any HTTPS URL

### `strictTransportSecurity`

- **Type**: `{ maxAge?: number; includeSubDomains?: boolean; preload?: boolean } | false`
- **Default**: `{ maxAge: 31536000, includeSubDomains: true }`

Forces browsers to use HTTPS for all requests.

**Options:**
- `maxAge`: How long (in seconds) to enforce HTTPS. Default: 1 year (31536000)
- `includeSubDomains`: Apply to all subdomains. Default: `true`
- `preload`: Submit to browser HSTS preload lists. Default: `false`

### `frameOptions`

- **Type**: `'DENY' | 'SAMEORIGIN' | false`
- **Default**: `'DENY'`

Prevents your site from being embedded in iframes (clickjacking protection).

- `DENY`: Cannot be framed at all
- `SAMEORIGIN`: Can only be framed by same origin

### `contentTypeOptions`

- **Type**: `'nosniff' | false`
- **Default**: `'nosniff'`

Prevents browsers from MIME-sniffing responses. Always serves content with declared Content-Type.

### `xssProtection`

- **Type**: `'0' | '1' | '1; mode=block' | false`
- **Default**: `'1; mode=block'`

Enables XSS filtering in older browsers (IE, Chrome, Safari).

- `0`: Disabled
- `1`: Enabled (sanitizes page)
- `1; mode=block`: Enabled (blocks page)

**Note**: Modern browsers rely on CSP instead.

### `referrerPolicy`

- **Type**: `'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | ... | false`
- **Default**: `'no-referrer'`

Controls how much referrer information is sent with requests.

**Options:**
- `no-referrer`: Never send referrer
- `no-referrer-when-downgrade`: Send on HTTPS→HTTPS
- `origin`: Send only origin
- `origin-when-cross-origin`: Full URL for same-origin, origin for cross-origin
- `same-origin`: Only for same-origin requests
- `strict-origin`: Origin only, not on downgrade
- `strict-origin-when-cross-origin`: Most secure with referrer info
- `unsafe-url`: Always send full URL (not recommended)

### `permissionsPolicy`

- **Type**: `Record<string, string[]> | false`
- **Default**: `undefined` (not set)

Controls which browser features and APIs can be used.

**Common Features:**

```typescript
{
  camera: [],                     // Disable camera
  microphone: [],                 // Disable microphone
  geolocation: ['self'],          // Allow geolocation from same origin
  payment: ['self', 'https://payment.example.com'],
  usb: [],                        // Disable USB
  magnetometer: [],               // Disable magnetometer
  accelerometer: [],              // Disable accelerometer
  gyroscope: []                   // Disable gyroscope
}
```

### Other Options

- `dnsPrefetchControl`: `'on' | 'off' | false` (default: `'off'`)
- `downloadOptions`: `'noopen' | false` (default: `'noopen'`)
- `permittedCrossDomainPolicies`: `'none' | 'master-only' | ... | false` (default: `'none'`)

## Preset Configurations

### Strict Security (Production)

```typescript
import { strictSecurity } from './middleware/security-headers/security-headers';

strictSecurity();
```

**Applies:**
- Very restrictive CSP (only 'self')
- 2-year HSTS with preload
- Frame embedding completely disabled
- No referrer information
- Most browser features disabled

### Relaxed Security (Development)

```typescript
import { relaxedSecurity } from './middleware/security-headers/security-headers';

relaxedSecurity();
```

**Applies:**
- No CSP
- No HSTS
- SAMEORIGIN frame embedding
- Basic XSS protection

## Advanced Examples

### API with External Resources

```typescript
import { securityHeaders } from './middleware/security-headers/security-headers';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders({
            contentSecurityPolicy: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "https://cdn.jsdelivr.net",
                    "https://unpkg.com"
                ],
                styleSrc: [
                    "'self'",
                    "https://fonts.googleapis.com"
                ],
                fontSrc: [
                    "'self'",
                    "https://fonts.gstatic.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https:",
                    "https://images.example.com"
                ],
                connectSrc: [
                    "'self'",
                    "https://api.example.com",
                    "wss://realtime.example.com"
                ]
            },
            strictTransportSecurity: {
                maxAge: 63072000,
                includeSubDomains: true
            }
        })
    ]
});
```

### Environment-Specific Security

```typescript
import { strictSecurity, relaxedSecurity } from './middleware/security-headers/security-headers';

const isDev = process.env.NODE_ENV === 'development';

const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        isDev ? relaxedSecurity() : strictSecurity()
    ]
});
```

### API-Only Application

```typescript
import { securityHeaders } from './middleware/security-headers/security-headers';

// Minimal headers for JSON API
const app = new Burger({
    apiDir: './api',
    globalMiddleware: [
        securityHeaders({
            contentSecurityPolicy: false, // Not needed for API
            frameOptions: 'DENY',
            contentTypeOptions: 'nosniff',
            referrerPolicy: 'no-referrer',
            strictTransportSecurity: {
                maxAge: 31536000,
                includeSubDomains: true
            }
        })
    ]
});
```

## Security Best Practices

### 1. Start Strict, Relax as Needed

```typescript
// Start with strict
strictSecurity();

// Then relax specific policies as you integrate external resources
securityHeaders({
    contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://trusted-cdn.com"]
    }
})
```

### 2. Test CSP with Report-Only Mode

Before enforcing CSP, test it first:

```typescript
// In development, use Content-Security-Policy-Report-Only header
// This reports violations without blocking them
```

### 3. Use HTTPS Everywhere

HSTS only works with HTTPS:

```typescript
strictTransportSecurity: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true // Only if you're ready!
}
```

### 4. Avoid 'unsafe-inline' and 'unsafe-eval'

These defeat much of CSP's protection:

```typescript
// ❌ Bad
scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"]

// ✅ Good
scriptSrc: ["'self'", "https://cdn.example.com"]
```

### 5. Regularly Update Headers

Security best practices evolve. Review your headers periodically.

## Testing Your Security Headers

### Online Tools

- [SecurityHeaders.com](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

### With curl

```bash
curl -I https://your-api.com | grep -i "security\|csp\|hsts\|frame"
```

## Browser Compatibility

| Header | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| CSP | ✅ | ✅ | ✅ | ✅ |
| HSTS | ✅ | ✅ | ✅ | ✅ |
| X-Frame-Options | ✅ | ✅ | ✅ | ✅ |
| X-Content-Type-Options | ✅ | ✅ | ✅ | ✅ |
| Permissions-Policy | ✅ | ✅ | ✅ | ✅ |

## Common Issues

### CSP Blocking Resources

If legitimate resources are blocked:

1. Check browser console for CSP violations
2. Add the blocked domain to appropriate directive
3. Use 'Report-Only' mode during testing

### HSTS Not Working

- Ensure you're using HTTPS
- Check `max-age` is sufficient
- Verify `includeSubDomains` if needed

### Headers Not Appearing

Make sure the middleware is applied globally or to the specific route.

## References

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN: HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [HSTS Preload List](https://hstspreload.org/)

