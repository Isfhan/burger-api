# Burger API Ecosystem

This folder contains official extensions and tools for the Burger API framework.

## 📦 Available Packages

### Middleware Collection
Located in `./middlewares/` - A comprehensive collection of production-ready middleware for Burger API applications.

**Features:**
- ✅ 10 production-ready middleware (CORS, Rate Limiter, Logger, etc.)
- ✅ Optimized for Bun.js v1.3.1+ with automatic fallbacks
- ✅ Comprehensive documentation and testing guides
- ✅ Shadcn-style copy approach for easy customization

**Quick Start:**
```bash
# Copy middleware to your project
cp -r ecosystem/middlewares/cors ./middleware/
cp -r ecosystem/middlewares/logger ./middleware/

# Use in your Burger API app
import { cors } from './middleware/cors/cors';
import { logger } from './middleware/logger/logger';

const app = new Burger({
    globalMiddleware: [logger(), cors()]
});
```

## 🚀 Future Plans

### CLI Tool (Coming Soon)
```bash
# Easy installation
burger-api add cors
burger-api add rate-limiter

# List available middleware
burger-api list

# Update middleware
burger-api update cors
```

### Additional Packages
- **Session Management** - Cookie-based sessions
- **CSRF Protection** - Cross-site request forgery prevention
- **Request ID** - Unique ID for each request
- **IP Whitelist/Blacklist** - IP-based access control
- **Webhook Signature Verification** - Verify webhook signatures
- **GraphQL** - GraphQL-specific middleware

## 📚 Documentation

- [Middleware Collection](./middlewares/README.md) - Complete middleware documentation
- [Testing Guide](./middlewares/TESTING.md) - Manual testing instructions
- [Burger API Framework](https://burger-api.com) - Main framework documentation

## 🤝 Contributing

Want to contribute to the ecosystem? Follow these guidelines:

1. Each package in its own folder
2. Include implementation files and comprehensive README.md
3. Follow the established patterns and conventions
4. Include tests and examples

## 📄 License

MIT License - feel free to use these packages in your projects!

---

**Built with ❤️ for the Burger API community | Optimized for Bun.js 🐰**
