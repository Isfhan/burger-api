import type { OpenAPIObject, DocsProvider } from '../types/openapi-config';

/**
 * Scalar API Reference — default docs UI.
 * Loads Scalar via CDN and embeds the spec inline for zero-config usage.
 */
export function scalarDocs(): DocsProvider {
    return (spec: OpenAPIObject) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${spec.info?.title || 'API Documentation'}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

/**
 * Swagger UI — alternative docs UI.
 * Loads Swagger UI via CDN.
 */
export function swaggerDocs(): DocsProvider {
    return (spec: OpenAPIObject) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${spec.info?.title || 'API Documentation'}</title>
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
          url: '/openapi.json',
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
    return (spec: OpenAPIObject) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${spec.info?.title || 'API Documentation'}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body>
    <div id="redoc"></div>
    <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
    <script>
      Redoc.init('/openapi.json', {}, document.getElementById('redoc'));
    </script>
  </body>
</html>`;
}
