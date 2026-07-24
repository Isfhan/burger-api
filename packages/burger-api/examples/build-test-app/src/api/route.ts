/**
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
import type { BurgerContext, BurgerNext } from 'burger-api';


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
 - Puts the validated data in ctx.validated for you to use

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
export const beforeRoute = [
    // Example: Log every request to this route
    async (ctx: BurgerContext): Promise<BurgerNext> => {
        console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.url}`);
        
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
   - ctx: The context object with validated data in ctx.validated
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
export async function GET(ctx: BurgerContext) {
    // Access validated query parameters from the schema
    const { search, limit, page } = (ctx.validated!.query as any);
    
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
export async function POST(ctx: BurgerContext) {
    // Get validated body data - already checked by Zod schema!
    const { name, description, price, category, isAvailable } = (ctx.validated!.body as any);
    
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
export async function PUT(ctx: BurgerContext) {
    // Get the item ID from query parameters
    const { id } = (ctx.validated!.query as any);
    
    // Get the fields to update from the request body
    const updates = (ctx.validated!.body as any);
    
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
export async function DELETE(ctx: BurgerContext) {
    // Get the item ID from query parameters
    const { id } = (ctx.validated!.query as any);
    
    // Delete the item (replace with your database delete)
    // Here we're just returning a success message
    return Response.json({
        success: true,
        message: `Item ${id} deleted successfully`,
    });
}
