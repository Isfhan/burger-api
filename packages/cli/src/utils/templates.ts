/**
 * Template Management System
 *
 * Handles downloading and caching project templates.
 * Templates are the starter projects users get when running `burger-api create`
 *
 */

import { join } from 'path';

import type { CreateOptions } from '../types/index';
import { spinner } from './logger';
import { downloadFile } from './github';

/**
 * Generate package.json content for a new project
 * This includes the burger-api dependency and basic scripts
 *
 * @param projectName - Name of the project
 * @returns package.json content as a string
 */
export function generatePackageJson(projectName: string): string {
    const packageJson = {
        name: projectName,
        version: '0.1.0',
        type: 'module',
        scripts: {
            dev: 'bun --watch src/index.ts',
            start: 'bun src/index.ts',
            build: 'bun build src/index.ts --outdir ./dist',
        },
        dependencies: {
            'burger-api': '^0.6.2',
        },
        devDependencies: {
            '@types/bun': 'latest',
            typescript: '^5',
        },
    };

    return JSON.stringify(packageJson, null, 2);
}

/**
 * Generate tsconfig.json content for a new project
 * This sets up TypeScript properly for Bun
 *
 * @returns tsconfig.json content as a string
 */
export function generateTsConfig(): string {
    const tsconfig = {
        compilerOptions: {
            lib: ['ESNext'],
            target: 'ESNext',
            module: 'ESNext',
            moduleDetection: 'force',
            jsx: 'react-jsx',
            allowJs: true,

            // Best practices for type safety
            strict: true,
            noUncheckedIndexedAccess: true,
            noImplicitOverride: true,

            // Module resolution for Bun
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            verbatimModuleSyntax: true,
            noEmit: true,

            // Interop
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,

            // Skip type checking for dependencies
            skipLibCheck: true,

            // Types
            types: ['bun-types'],
        },
    };

    return JSON.stringify(tsconfig, null, 2);
}

/**
 * Generate .gitignore content
 *
 * @returns .gitignore content as a string
 */
export function generateGitIgnore(): string {
    return `# Bun
node_modules/
bun.lockb
.env*

# Build output
dist/
.build/
*.exe

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo
`;
}

/**
 * Generate .prettierrc content
 * This matches the burger-api project style
 *
 * @returns .prettierrc content as a string
 */
export function generatePrettierConfig(): string {
    const prettierConfig = {
        semi: true,
        singleQuote: true,
        tabWidth: 4,
        trailingComma: 'es5',
        printWidth: 80,
        arrowParens: 'always',
    };

    return JSON.stringify(prettierConfig, null, 2);
}

/**
 * Generate index.ts content based on user options
 * This is the main entry point for the user's project
 *
 * @param options - Project configuration from user prompts
 * @returns index.ts content as a string
 */
export function generateIndexFile(options: CreateOptions): string {
    const lines: string[] = [];

    // Import statement
    lines.push("import { Burger } from 'burger-api';");
    lines.push('');

    // Configuration object
    lines.push('const app = new Burger({');

    if (options.useApi) {
        lines.push(`    apiDir: './src/${options.apiDir || 'api'}',`);
        if (options.apiPrefix && options.apiPrefix !== '/api') {
            lines.push(`    apiPrefix: '${options.apiPrefix}',`);
        }
    }

    if (options.usePages) {
        lines.push(`    pageDir: './src/${options.pageDir || 'pages'}',`);
        if (options.pagePrefix && options.pagePrefix !== '/') {
            lines.push(`    pagePrefix: '${options.pagePrefix}',`);
        }
    }

    if (options.debug) {
        lines.push('    debug: true,');
    }

    lines.push('    globalMiddleware: [],');
    lines.push('});');
    lines.push('');

    // Start server - uses PORT env variable for flexibility (e.g., burger-api serve --port 4000)
    lines.push('const port = Number(process.env.PORT) || 4000;');
    lines.push('app.serve(port, () => {');
    lines.push(
        '    console.log(`Server running on http://localhost:${port}`);'
    );
    lines.push('});');

    return lines.join('\n');
}

/**
 * Generate a comprehensive API route file with full examples
 * Includes: OpenAPI metadata, Zod schemas, all HTTP methods, middleware
 * Every line has beginner-friendly comments explaining what it does
 *
 * @returns route.ts content as a string
 */
export function generateApiRoute(): string {
    return `/**
 * =============================================================================
 * BURGER API - EXAMPLE ROUTE FILE
 * =============================================================================
 * 
 * This file shows you everything you can do with BurgerAPI routes!
 * 
 * KEY CONCEPTS:
 * - This file is automatically loaded because it's named "route.ts"
 * - The folder path becomes the URL path (e.g., /api/route.ts → /api)
 * - Export functions named after HTTP methods: GET, POST, PUT, DELETE, etc.
 * 
 * =============================================================================
 */


import { z } from 'zod';
import type { BurgerRequest, Middleware, BurgerNext } from 'burger-api';


/*
-----------------------------------------------------------------------------
   OPENAPI METADATA (Optional but recommended!)
-----------------------------------------------------------------------------

 - This creates automatic documentation for your API!
 - Visit /docs in your browser to see beautiful Swagger UI documentation.
 - Each HTTP method (get, post, put, delete) can have its own documentation.
-----------------------------------------------------------------------------
*/
export const openapi = {
    // Documentation for the GET method
    get: {
        // 'summary' - A short title shown in the docs (keep it brief!)
        summary: 'Get all items',
        
        // 'description' - A longer explanation of what this endpoint does
        description: 'Fetches a list of items. You can filter results using query parameters.',
        
        // 'tags' - Groups related endpoints together in the docs
        // All endpoints with the same tag appear in the same section
        tags: ['Items'],
        
        // 'operationId' - A unique ID for this endpoint (useful for code generation)
        operationId: 'getItems',
        
        // 'responses' - Documents what responses the endpoint can return
        responses: {
            '200': { description: 'Successfully retrieved items' },
            '400': { description: 'Invalid query parameters' },
        },
    },
    
    // Documentation for the POST method
    post: {
        summary: 'Create a new item',
        description: 'Creates a new item with the provided data. Returns the created item.',
        tags: ['Items'],
        operationId: 'createItem',
        responses: {
            '201': { description: 'Item created successfully' },
            '400': { description: 'Invalid request body' },
        },
    },
    
    // Documentation for the PUT method
    put: {
        summary: 'Update an item',
        description: 'Updates an existing item. Provide the item ID in the query string.',
        tags: ['Items'],
        operationId: 'updateItem',
        responses: {
            '200': { description: 'Item updated successfully' },
            '400': { description: 'Invalid request data' },
            '404': { description: 'Item not found' },
        },
    },
    
    // Documentation for the DELETE method  
    delete: {
        summary: 'Delete an item',
        description: 'Permanently deletes an item by ID.',
        tags: ['Items'],
        operationId: 'deleteItem',
        responses: {
            '200': { description: 'Item deleted successfully' },
            '404': { description: 'Item not found' },
        },
    },
};


/*
-----------------------------------------------------------------------------
  SCHEMA VALIDATION (Using Zod)
-----------------------------------------------------------------------------

- Schemas define what data your API accepts. BurgerAPI automatically:
 - Validates incoming data against these schemas
 - Returns a 400 error if validation fails
 - Puts the validated data in req.validated for you to use

 - You can validate:
   - 'query'  → URL query parameters like ?search=hello&page=1
   - 'body'   → Request body (for POST/PUT requests)
   - 'params' → URL parameters like /items/[id] → { id: "123" }
-----------------------------------------------------------------------------
*/
export const schema = {
    // Schema for GET requests - validates query parameters
    get: {
        // 'query' - Validates the URL query string
        // Example URL: /api?search=burger&limit=10&page=2
        query: z.object({
            // 'search' - Optional text to search for
            // .optional() means this field isn't required
            search: z.string().optional(),
            
            // 'limit' - How many items to return (default: 10)
            // .coerce.number() converts string "10" to number 10
            // .min(1) means it must be at least 1
            // .max(100) means it can't be more than 100
            // .default(10) uses 10 if not provided
            limit: z.coerce.number().min(1).max(100).default(10),
            
            // 'page' - Which page of results to return
            page: z.coerce.number().min(1).default(1),
        }),
    },
    
    // Schema for POST requests - validates the request body
    post: {
        // 'body' - Validates JSON data sent in the request body
        body: z.object({
            // 'name' - Required, must be at least 1 character
            // .min(1, '...') shows a custom error message if too short
            name: z.string().min(1, 'Name is required'),
            
            // 'description' - Optional text field
            description: z.string().optional(),
            
            // 'price' - Required, must be a positive number
            // .positive() ensures the number is greater than 0
            price: z.number().positive('Price must be greater than 0'),
            
            // 'category' - Must be one of these specific values
            // .enum() only allows the listed values
            category: z.enum(['food', 'drink', 'dessert']),
            
            // 'isAvailable' - Optional boolean, defaults to true
            isAvailable: z.boolean().default(true),
        }),
    },
    
    // Schema for PUT requests - validates both query and body
    put: {
        // Which item to update (ID in query string)
        query: z.object({
            id: z.string().min(1, 'Item ID is required'),
        }),
        
        // What to update (in the request body)
        // .partial() makes all fields optional (for partial updates)
        body: z.object({
            name: z.string().min(1),
            description: z.string(),
            price: z.number().positive(),
            category: z.enum(['food', 'drink', 'dessert']),
            isAvailable: z.boolean(),
        }).partial(), // .partial() = all fields become optional
    },
    
    // Schema for DELETE requests - validates query parameters
    delete: {
        query: z.object({
            id: z.string().min(1, 'Item ID is required'),
        }),
    },
};


/*
-----------------------------------------------------------------------------
    ROUTE-SPECIFIC MIDDLEWARE (Optional)
-----------------------------------------------------------------------------

 - Middleware runs BEFORE your route handler. Use it for:
   - Logging requests
   - Checking authentication
   - Modifying the request
   - Blocking unauthorized access

 - Return 'undefined' to continue to the next middleware/handler
 - Return a 'Response' to stop and send that response immediately
-----------------------------------------------------------------------------
*/
export const middleware: Middleware[] = [
    // Example: Log every request to this route
    async (req: BurgerRequest): Promise<BurgerNext> => {
        console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.url}\`);
        
        // Return undefined to continue to the next middleware/handler
        // If you return a Response here, it stops and sends that response
        return undefined;
    },
];

/*
-----------------------------------------------------------------------------
    HTTP HANDLERS
-----------------------------------------------------------------------------

 - These functions handle the actual requests. They receive:
   - req: The request object with validated data in req.validated
 - They must return a Response object. Use Response.json() for JSON responses.
-----------------------------------------------------------------------------
*/

/**
 * GET - Fetch items with optional filtering
 * 
 * Example requests:
 * - GET /api           → Get first 10 items
 * - GET /api?limit=5   → Get first 5 items  
 * - GET /api?search=burger&page=2 → Search for "burger", page 2
 */
export async function GET(req: BurgerRequest<{ query: z.infer<typeof schema.get.query> }>) {
    // Access validated query parameters from the schema
    const { search, limit, page } = req.validated.query;
    
    // Mock data (replace with your database query)
    const mockItems = [
        { id: '1', name: 'Classic Burger', price: 9.99, category: 'food' },
        { id: '2', name: 'Cheese Burger', price: 11.99, category: 'food' },
        { id: '3', name: 'Cola', price: 2.99, category: 'drink' },
    ];
    
    // Filter items if search is provided
    let items = mockItems;
    if (search) {
        items = items.filter(item => 
            item.name.toLowerCase().includes(search.toLowerCase())
        );
    }
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);
    
    // Return JSON response with status 200 (default)
    return Response.json({
        success: true,
        data: paginatedItems,
        pagination: {
            page,
            limit,
            total: items.length,
            totalPages: Math.ceil(items.length / limit),
        },
    });
}

/**
 * POST - Create a new item
 * 
 * Example request body:
 * {
 *   "name": "Veggie Burger",
 *   "description": "Delicious plant-based burger",
 *   "price": 12.99,
 *   "category": "food"
 * }
 */
export async function POST(req: BurgerRequest<{ body: z.infer<typeof schema.post.body> }>) {
    // Get validated body data - already checked by Zod schema!
    const { name, description, price, category, isAvailable } = req.validated.body;
    
    // Create the item (replace with your database insert)
    const newItem = {
        id: crypto.randomUUID(), // Generate unique ID
        name,
        description: description || null,
        price,
        category,
        isAvailable,
        createdAt: new Date().toISOString(),
    };
    
    // Return the created item with status 201 (Created)
    return Response.json({
        success: true,
        message: 'Item created successfully',
        data: newItem,
    }, { status: 201 });
}

/**
 * PUT - Update an existing item
 * 
 * Example: PUT /api?id=123
 * Body: { "name": "Updated Name", "price": 15.99 }
 */
export async function PUT(req: BurgerRequest<{ query: z.infer<typeof schema.put.query>, body: z.infer<typeof schema.put.body> }>) {
    // Get the item ID from query parameters
    const { id } = req.validated.query;
    
    // Get the fields to update from the request body
    const updates = req.validated.body;
    
    // Find and update the item (replace with your database update)
    // Here we're just simulating an update
    const updatedItem = {
        id,
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    
    return Response.json({
        success: true,
        message: 'Item updated successfully',
        data: updatedItem,
    });
}

/**
 * DELETE - Remove an item
 * 
 * Example: DELETE /api?id=123
 */
export async function DELETE(req: BurgerRequest<{ query: z.infer<typeof schema.delete.query> }>) {
    // Get the item ID from query parameters
    const { id } = req.validated.query;
    
    // Delete the item (replace with your database delete)
    // Here we're just returning a success message
    return Response.json({
        success: true,
        message: \`Item \${id} deleted successfully\`,
    });
}
`;
}

/**
 * Generate a CSS file with modern styling for the landing page
 *
 * @returns style.css content as a string
 */
export function generateSampleCss(): string {
    return `
        :root {
            --color-primary: hsl(30, 75%, 90%);
            --color-primary-dark: hsl(30, 75%, 80%);
            --color-bg: #09090b;
            --color-surface: hsl(240, 10%, 3.9%);
            --color-border: hsl(240, 3.7%, 15.9%);
            --color-success: hsl(120, 50%, 40%);
            --color-text-muted: hsl(240, 5%, 50%);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Poppins', system-ui, sans-serif;
            min-height: 100vh;
            background: var(--color-bg);
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 60px 20px 40px;
        }

        .hero {
            text-align: center;
            max-width: 600px;
            margin-bottom: 48px;
        }

        .logo-wrapper {
            display: flex;
            flex-wrap: wrap;
            margin-bottom: 32px;
        }

        .logo {
            width: 80px;
            height: 80px;
        }

        .logo-text {
            font-size: 3.5rem;
            font-weight: 600;
            color: var(--color-primary);
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 600;
            margin-bottom: 12px;
            color: #fff;
        }

        .subtitle {
            color: var(--color-text-muted);
            font-size: 1.1rem;
            margin-bottom: 24px;
        }

        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: hsla(120, 50%, 40%, 0.1);
            border: 1px solid hsla(120, 50%, 40%, 0.3);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.875rem;
            color: var(--color-success);
        }

        .status::before {
            content: '';
            width: 8px;
            height: 8px;
            background: var(--color-success);
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Edit hint section */
        .edit-hint {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 24px 32px;
            margin-bottom: 48px;
            max-width: 500px;
            text-align: center;
        }

        .edit-hint p {
            color: var(--color-text-muted);
            font-size: 0.95rem;
            margin-bottom: 8px;
        }

        .edit-hint code {
            color: var(--color-primary);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
        }

        .edit-hint .hint {
            font-size: 0.8rem;
            color: hsl(240, 5%, 40%);
            margin-top: 12px;
        }

        /* Quick start section */
        .quick-start {
            max-width: 500px;
            width: 100%;
            margin-bottom: 48px;
        }

        .quick-start h2 {
            font-size: 1rem;
            font-weight: 500;
            color: var(--color-text-muted);
            margin-bottom: 16px;
            text-align: center;
        }

        .commands {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .command {
            display: flex;
            align-items: center;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            padding: 12px 16px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            transition: border-color 0.2s;
        }

        .command:hover {
            border-color: var(--color-primary-dark);
        }

        .command .prefix {
            color: var(--color-success);
            margin-right: 8px;
        }

        .command .cmd {
            color: var(--color-primary);
        }

        .command .comment {
            color: var(--color-text-muted);
            margin-left: auto;
            font-size: 0.75rem;
        }

        /* Links section */
        .links {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 48px;
        }

        .link {
            color: var(--color-text-muted);
            text-decoration: none;
            font-size: 0.9rem;
            padding: 10px 20px;
            border: 1px solid var(--color-border);
            border-radius: 8px;
            transition: all 0.2s;
        }

        .link:hover {
            color: var(--color-primary);
            border-color: var(--color-primary-dark);
            background: var(--color-surface);
        }

        .link.primary {
            background: var(--color-primary);
            border-color: var(--color-primary);
            color: #000;
        }

        .link.primary:hover {
            background: var(--color-primary-dark);
            border-color: var(--color-primary-dark);
        }

        /* Documentation links */
        .docs-links {
            display: flex;
            gap: 32px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 48px;
            padding-top: 32px;
            border-top: 1px solid var(--color-border);
            max-width: 600px;
            width: 100%;
        }

        .docs-section h3 {
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--color-text-muted);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .docs-section a {
            display: block;
            color: hsl(240, 5%, 60%);
            text-decoration: none;
            font-size: 0.85rem;
            padding: 4px 0;
            transition: color 0.2s;
        }

        .docs-section a:hover {
            color: var(--color-primary);
        }

        /* Footer */
        .footer {
            margin-top: auto;
            text-align: center;
            padding-top: 32px;
        }

        .version {
            font-size: 0.75rem;
            color: hsl(240, 5%, 35%);
            margin-bottom: 16px;
        }

        .social-links {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-bottom: 16px;
        }

        .social-links a {
            color: var(--color-text-muted);
            text-decoration: none;
            font-size: 0.85rem;
            transition: color 0.2s;
        }

        .social-links a:hover {
            color: var(--color-primary);
        }

        .powered-by {
            color: hsl(240, 5%, 35%);
            font-size: 0.8rem;
        }

        .powered-by a {
            color: var(--color-primary-dark);
            text-decoration: none;
        }

        .powered-by a:hover {
            color: var(--color-primary);
        }

        @media (max-width: 600px) {
            h1 { font-size: 2rem; }
            .docs-links { flex-direction: column; gap: 24px; text-align: center; }
            .command .comment { display: none; }
        }
    `;
}

/**
 * Generate a sample JavaScript file with useful utilities
 *
 * @returns app.js content as a string
 */
export function generateSampleJs(): string {
    return 'console.log("Hello from app.js");';
}

/**
 * Generate a minimal, clean landing page
 * Uses official BurgerAPI color scheme
 *
 * @param projectName - Name of the project
 * @returns index.html content as a string
 */
export function generateIndexPage(projectName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <link rel="icon" type="image/png" href="https://burger-api.com/img/logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <!-- Assets: Styles -->
    <link rel="stylesheet" href="./assets/css/style.css" />
    <!-- Assets: Scripts -->
    <script src="./assets/js/app.js" type="module"></script>
</head>
<body>
    <!-- Hero Section -->
    <section class="hero">
        <div class="logo-wrapper">
            <img src="https://burger-api.com/img/logo.png" alt="BurgerAPI Logo" class="logo">
            <span class="logo-text">BurgerAPI</span>
        </div>
        <p class="subtitle">Your Project ${projectName} is ready</p>
        <div class="status">Server running</div>
    </section>

    <!-- Edit Hint -->
    <div class="edit-hint">
        <p>Edit <code>src/pages/index.html</code> and save to reload the page.</p>
        <p>Edit <code>src/api/route.ts</code> and save to reload the API endpoint.</p>
        <p class="hint">Your changes will automatically refresh the server.</p>
    </div>

    <!-- Quick Start Commands -->
    <section class="quick-start">
        <h2>Quick Start</h2>
        <div class="commands">
            <div class="command">
                <span class="prefix">$</span>
                <span class="cmd">burger-api add cors logger</span>
                <span class="comment"># Add middleware</span>
            </div>
            <div class="command">
                <span class="prefix">$</span>
                <span class="cmd">burger-api build src/index.ts</span>
                <span class="comment"># Build for production</span>
            </div>
        </div>
    </section>

    <!-- Action Links -->
    <div class="links">
        <a href="/docs" class="link primary">API Docs</a>
        <a href="/api" class="link">Try API</a>
        <a href="/openapi.json" class="link">OpenAPI</a>
    </div>

    <!-- Documentation Links -->
    <div class="docs-links">
        <div class="docs-section">
            <h3>Documentation</h3>
            <a href="https://burger-api.com/docs" target="_blank">Getting Started</a>
            <a href="https://burger-api.com/docs/core/configuration" target="_blank">Configuration</a>
            <a href="https://burger-api.com/docs/request-handling/middleware" target="_blank">Middleware</a>
        </div>
        <div class="docs-section">
            <h3>Resources</h3>
            <a href="https://github.com/isfhan/burger-api" target="_blank">GitHub</a>
            <a href="https://github.com/isfhan/burger-api/issues" target="_blank">Report Issue</a>
            <a href="https://www.npmjs.com/package/burger-api" target="_blank">NPM Package</a>
        </div>
        <div class="docs-section">
            <h3>Community</h3>
            <a href="https://github.com/isfhan/burger-api" target="_blank">Contribute</a>
            <a href="https://github.com/isfhan/burger-api/discussions" target="_blank">Discussions</a>
            <a href="https://github.com/isfhan/burger-api/stargazers" target="_blank">Star on GitHub</a>
        </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
        <div class="version">BurgerAPI v0.7.1 • Bun v1.3+</div>
        <div class="social-links">
            <a href="https://github.com/isfhan/burger-api" target="_blank">GitHub</a>
            <a href="https://www.npmjs.com/package/burger-api" target="_blank">NPM</a>
            <a href="https://burger-api.com" target="_blank">Website</a>
        </div>
        <p class="powered-by">
            Built with ❤️ using <a href="https://burger-api.com">BurgerAPI</a>
        </p>
    </footer>
</body>
</html>
`;
}

/**
 * Generate middleware index file
 * This is where users will export their middleware
 *
 * @returns middleware/index.ts content as a string
 */
export function generateMiddlewareIndex(): string {
    return `/**
 * Global Middleware Configuration
 * 
 * Import and export middleware here to use them in your app.
 * Example:
 * 
 * import { cors } from './cors/cors';
 * import { logger } from './logger/logger';
 * 
 * export const globalMiddleware = [
 *     logger(),
 *     cors(),
 * ];
 */

export const globalMiddleware: any[] = [];
`;
}

/**
 * Download the .llm-context folder from GitHub to the target project
 * This includes context files for AI assistants working with Burger API
 *
 * @param targetDir - Where to create the project
 */
async function downloadLlmFolder(targetDir: string): Promise<void> {
    try {
        const llmDir = join(targetDir, 'ecosystem', '.llm-context');

        // Download all three .llm files from GitHub
        const files = ['llms.txt', 'llms-small.txt', 'llms-full.txt'];

        for (const fileName of files) {
            const sourcePath = `ecosystem/.llm-context/${fileName}`;
            const destPath = join(llmDir, fileName);
            await downloadFile(sourcePath, destPath);
        }
    } catch (err) {
        // Log warning but don't fail project creation if download fails
        // This allows projects to be created even if GitHub is unreachable
        console.warn(
            `Warning: Could not download .llm-context folder: ${
                err instanceof Error ? err.message : 'Unknown error'
            }`
        );
    }
}

/**
 * Create a new project with all necessary files
 * This is the main function that sets up everything
 *
 * @param targetDir - Where to create the project
 * @param options - Project configuration from user prompts
 */
export async function createProject(
    targetDir: string,
    options: CreateOptions
): Promise<void> {
    const spin = spinner('Creating project structure...');

    try {
        // Create base files that every project needs
        await Bun.write(
            join(targetDir, 'package.json'),
            generatePackageJson(options.name)
        );
        await Bun.write(join(targetDir, 'tsconfig.json'), generateTsConfig());
        await Bun.write(join(targetDir, '.gitignore'), generateGitIgnore());
        await Bun.write(
            join(targetDir, '.prettierrc'),
            generatePrettierConfig()
        );

        // Create src directory and index file
        await Bun.write(
            join(targetDir, 'src', 'index.ts'),
            generateIndexFile(options)
        );

        // Create API directory and files if requested
        if (options.useApi) {
            const apiDir = join(targetDir, 'src', options.apiDir || 'api');
            await Bun.write(join(apiDir, 'route.ts'), generateApiRoute());
        }

        // Create Pages directory and files if requested
        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await Bun.write(
                join(pagesDir, 'index.html'),
                generateIndexPage(options.name)
            );
        }

        // Create sample assets inside pages directory (so they're served by page router)
        if (options.usePages) {
            const pagesDir = join(targetDir, 'src', options.pageDir || 'pages');
            await Bun.write(
                join(pagesDir, 'assets', 'css', 'style.css'),
                generateSampleCss()
            );
            await Bun.write(
                join(pagesDir, 'assets', 'js', 'app.js'),
                generateSampleJs()
            );
            // Logo is loaded from https://burger-api.com/img/logo.png
        }

        // Create ecosystem/middleware directory for installed middleware
        // Users can also create their own middleware/ folder for custom middleware
        const ecosystemMiddlewareDir = join(
            targetDir,
            'ecosystem',
            'middleware'
        );
        await Bun.write(
            join(ecosystemMiddlewareDir, 'index.ts'),
            generateMiddlewareIndex()
        );

        // Download .llm-context folder with context files for AI assistants
        await downloadLlmFolder(targetDir);

        spin.stop('Project created successfully!');
    } catch (err) {
        spin.stop('Failed to create project', true);
        throw err;
    }
}

/**
 * Install dependencies in a project directory
 * Runs `bun install` to install all packages
 *
 * @param projectDir - Directory containing package.json
 */
export async function installDependencies(projectDir: string): Promise<void> {
    const spin = spinner('Installing dependencies...');

    try {
        // Run bun install using Bun.spawn
        const proc = Bun.spawn(['bun', 'install'], {
            cwd: projectDir,
            stdout: 'ignore',
            stderr: 'pipe',
        });

        // Wait for it to complete
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            throw new Error('bun install failed');
        }

        spin.stop('Dependencies installed!');
    } catch (err) {
        spin.stop('Failed to install dependencies', true);
        throw err;
    }
}
