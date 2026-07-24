import { Burger, setDir } from '../../src/index';


// Create a new burger instance demonstrating a complete production application
const burger = new Burger({
    title: '🍔 My Burger API App - Production Ready Demo',
    description: `
A complete demonstration of a production-ready BurgerAPI application.

## ✨ What This Example Shows:
- **Full Application Structure**: Complete API with all features
- **Production Middleware**: Auth, rate limiting, CORS, logging
- **Real-World Patterns**: How to structure a complete application
- **Best Practices**: Production-ready configuration and setup
- **Scalable Architecture**: Foundation for growing applications

## 🚀 Key Concepts:
1. **Complete Setup**: All middleware and features configured
2. **Production Ready**: Security, monitoring, and performance features
3. **Real-World Usage**: How to build actual applications
4. **Best Practices**: Industry-standard patterns and configurations
5. **Scalability**: Architecture that grows with your needs

Perfect for developers building real-world applications!
    `,
    version: '2.0.0',
    apiDir: setDir(__dirname, 'api'),
    apiPrefix: 'api',
    debug: true,
});

const port = Number(process.env.PORT) || 4000;

// Start the server with comprehensive production information
burger.serve(port, () => {
    console.log('🍔 My Burger API App - Production Ready Demo is running!');
    console.log('=========================================================');
    console.log('');
    console.log(`📖 API Documentation: http://localhost:${port}/docs`);
    console.log(`🔗 OpenAPI Spec: http://localhost:${port}/openapi.json`);
    console.log('');
    console.log('🏗️ Production Features Enabled:');
    console.log('');
    console.log('🔐 Security & Authentication:');
    console.log('   • JWT token validation');
    console.log('   • Role-based access control');
    console.log('   • Secure headers and CORS');
    console.log('');
    console.log('⚡ Performance & Monitoring:');
    console.log('   • Rate limiting (100 req/min)');
    console.log('   • Request logging and tracking');
    console.log('   • Performance monitoring');
    console.log('');
    console.log('🌐 Cross-Origin Support:');
    console.log('   • CORS configuration');
    console.log('   • Preflight request handling');
    console.log('   • Credentials support');
    console.log('');
    console.log('📊 Application Structure:');
    console.log('   • Organized API endpoints');
    console.log('   • Middleware pipeline');
    console.log('   • Error handling');
    console.log('   • Validation schemas');
    console.log('');
    console.log('💡 Production Best Practices:');
    console.log('   • Environment-based configuration');
    console.log('   • Structured logging');
    console.log('   • Error tracking');
    console.log('   • Security headers');
    console.log('');
    console.log('🚀 Ready for production deployment!');
});
