# Burger API Ecosystem

This folder contains official extensions and tools for the Burger API framework.

## 📁 Standardized Project Structure

To maintain consistency and organization across all Burger API projects, we
recommend the following folder structure:

```
my-burger-app/
├── ecosystem/           # Official middleware collection (copy from burger-api)
│   ├── .llm-context/   # AI context files for Burger API documentation
│   │   ├── llms.txt
│   │   ├── llms-small.txt
│   │   └── llms-full.txt
│   └── middlewares/
│       ├── cors/
│       ├── logger/
│       ├── rate-limiter/
│       └── ...
├── middleware/          # Your middleware configuration
│   ├── global/
│   │   └── index.ts     # Export array of global middleware
│   ├── route-specific/  #  Route-specific middleware
│   │   └── auth.ts
│   └── custom/         # Your custom middleware
│       └── my-middleware.ts
└── index.ts            # Main app entry
```

## 🚀 Quick Setup

### Step 1: Copy Ecosystem

```bash
# Copy the entire ecosystem folder to your project
cp -r burger-api/ecosystem ./
```

### Step 2: Create Middleware Structure

```bash
# Create the recommended middleware folder structure
mkdir -p middleware/{global,route-specific,custom}
```

### Step 3: Configure Global Middleware

Create `middleware/global/index.ts`:

```typescript
import { cors } from '../../ecosystem/middlewares/cors/cors';
import { logger } from '../../ecosystem/middlewares/logger/logger';
import { rateLimit } from '../../ecosystem/middlewares/rate-limiter/rate-limiter';

export const globalMiddleware = [
    logger({
        level: 'info',
        format: 'combined',
    }),
    cors({
        origin:
            process.env.NODE_ENV === 'production'
                ? ['https://example.com']
                : '*',
        credentials: true,
        debug: process.env.NODE_ENV !== 'production',
    }),
    rateLimit({
        windowMs: 60000,
        maxRequests: 100,
    }),
];
```

### Step 4: Use in Your App

```typescript
// index.ts
import { Burger } from 'burger-api';
import { globalMiddleware } from './middleware/global';

const app = new Burger({
    apiDir: './api',
    globalMiddleware, // Clean and organized!
});

app.serve(4000);
```

## 📦 Available Packages

### Middleware Collection

Located in `./middlewares/` - A comprehensive collection of production-ready
middleware for Burger API applications.

**Features:**

-   ✅ Production-ready middleware (CORS, Rate Limiter, Logger, etc.)
-   ✅ Optimized for Bun.js v1.3.1+ with automatic fallbacks
-   ✅ Comprehensive documentation and testing guides
-   ✅ Copy & paste approach for easy customization

### AI Context Files

Located in `./.llm-context/` - Documentation files that provide context for AI
assistants working with Burger API projects.

**Files:**

-   `llms.txt` - Essential reference guide for Burger API
-   `llms-small.txt` - Compact documentation with key concepts
-   `llms-full.txt` - Complete documentation with all features and examples

**Purpose:**

These files are automatically included when you create a new Burger API project
using the CLI (`burger-api create`). They help AI assistants understand the
framework's structure, patterns, and best practices, enabling better code
suggestions and assistance.

**Note:** These files are optional and can be safely removed if not needed. They
don't affect the runtime behavior of your application.

## 🎯 Benefits of This Structure

### **Organization**

-   ✅ **Clean separation** of ecosystem vs custom middleware
-   ✅ **Easy management** of global middleware in one place
-   ✅ **Scalable** for large applications
-   ✅ **Consistent** across all Burger API projects

### **Development Experience**

-   ✅ **Easy to enable/disable** middleware by editing one file
-   ✅ **Clear separation** of concerns
-   ✅ **Future CLI-ready** structure
-   ✅ **Easy to maintain** and update

### **Performance**

-   ✅ **Pre-computed optimizations** in all middleware
-   ✅ **Minimal overhead** with efficient implementations
-   ✅ **Production-ready** configurations

## 📚 Documentation

-   [Middleware Collection](./middlewares/README.md) - Complete middleware
    documentation
-   [Testing Guide](./middlewares/TESTING.md) - Manual testing instructions
-   [Burger API Framework](https://burger-api.com) - Main framework
    documentation

## 🤝 Contributing

Want to contribute to the ecosystem? Follow these guidelines:

1. Each package in its own folder within `./middlewares/`
2. Include implementation files and comprehensive README.md
3. Follow the established patterns and conventions
4. Include tests and examples
5. Use the standardized folder structure

## 📄 License

MIT License - feel free to use these packages in your projects!

---

**Built with ❤️ for the Burger API community**
