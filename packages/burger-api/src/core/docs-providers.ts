import type {
    OpenAPIObject,
    DocsProvider,
    DocsProviderOptions,
} from '../types/openapi-config.js';

/** Escapes text for safe interpolation into HTML content and attributes. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function pageTitle(spec: OpenAPIObject): string {
    const title = spec.info?.title;
    return escapeHtml(typeof title === 'string' && title ? title : 'API Documentation');
}

/** A JS string literal safe to embed inside an inline <script>. */
function jsString(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Scalar API Reference — alternative docs UI.
 * Loads Scalar via CDN and points it at the served spec.
 */
export function scalarDocs(): DocsProvider {
    return (spec: OpenAPIObject, { specUrl }: DocsProviderOptions) => `<!DOCTYPE html>
<html lang="en">
 <head>
 <meta charset="UTF-8">
 <title>${pageTitle(spec)}</title>
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 </head>
 <body>
 <script id="api-reference" data-url="${escapeHtml(specUrl)}"></script>
 <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
 </body>
</html>`;
}

/**
 * Swagger UI — default docs UI.
 * Loads Swagger UI via CDN.
 */
export function swaggerDocs(): DocsProvider {
    return (spec: OpenAPIObject, { specUrl }: DocsProviderOptions) => `<!DOCTYPE html>
<html lang="en">
 <head>
 <meta charset="UTF-8">
 <title>${pageTitle(spec)}</title>
 <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
 <style>
 body { margin: 0; padding: 0; }
 </style>
 </head>
 <body>
 <div id="swagger-ui"></div>
 <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
 <script>
 window.onload = function() {
 SwaggerUIBundle({
 url: ${jsString(specUrl)},
 dom_id: '#swagger-ui',
 presets: [
 SwaggerUIBundle.presets.apis,
 SwaggerUIBundle.SwaggerUIStandalonePreset
 ],
 layout: "BaseLayout",
 docExpansion: "none",
 filter: true,
 });
 };
 </script>
 </body>
</html>`;
}

/**
 * ReDoc — alternative docs UI.
 * Loads ReDoc via CDN.
 */
export function redocDocs(): DocsProvider {
    return (spec: OpenAPIObject, { specUrl }: DocsProviderOptions) => `<!DOCTYPE html>
<html lang="en">
 <head>
 <meta charset="UTF-8">
 <title>${pageTitle(spec)}</title>
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 </head>
 <body>
 <div id="redoc"></div>
 <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
 <script>
 Redoc.init(${jsString(specUrl)}, {}, document.getElementById('redoc'));
 </script>
 </body>
</html>`;
}
