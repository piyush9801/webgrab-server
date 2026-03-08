"use strict";
/**
 * WebGrab Server - Main Entry Point
 *
 * Express server that provides the backend for the WebGrab Figma plugin.
 * Renders websites in headless Chrome, extracts DOM trees with computed styles,
 * and converts them to Figma-compatible JSON structures.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const renderer_js_1 = require("./engine/renderer.js");
// Import routes
const capture_js_1 = __importDefault(require("./routes/capture.js"));
const parse_js_1 = __importDefault(require("./routes/parse.js"));
const upload_js_1 = __importDefault(require("./routes/upload.js"));
const proxy_js_1 = __importDefault(require("./routes/proxy.js"));
// ─── Configuration ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3500', 10);
const HOST = process.env.HOST || '0.0.0.0';
// ─── Express app setup ────────────────────────────────────────────────
const app = (0, express_1.default)();
// CORS - allow all origins (Figma plugin runs in a sandbox)
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 3600,
}));
// Body parsers
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Request logging middleware
app.use((req, _res, next) => {
    const start = Date.now();
    const { method, path } = req;
    // Log when response finishes
    _res.on('finish', () => {
        const elapsed = Date.now() - start;
        const status = _res.statusCode;
        const statusColor = status >= 500
            ? '\x1b[31m' // red
            : status >= 400
                ? '\x1b[33m' // yellow
                : '\x1b[32m'; // green
        console.log(`${statusColor}${status}\x1b[0m ${method} ${path} - ${elapsed}ms`);
    });
    next();
});
// ─── Health check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        service: 'webgrab-server',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
    });
});
// ─── API Routes ───────────────────────────────────────────────────────
app.use('/api', capture_js_1.default);
app.use('/api', parse_js_1.default);
app.use('/api', upload_js_1.default);
app.use('/api', proxy_js_1.default);
// ─── 404 handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        error: 'Not found',
        details: `Route ${_req.method} ${_req.path} does not exist`,
        availableRoutes: [
            'GET  /api/health',
            'POST /api/capture-url',
            'POST /api/parse-html',
            'POST /api/parse-file',
            'GET  /api/proxy-asset?url=<encoded_url>',
        ],
    });
});
// ─── Global error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('\x1b[31m[ERROR]\x1b[0m Unhandled error:', err.message);
    console.error(err.stack);
    // Handle multer errors
    if (err.message?.includes('Unsupported file type')) {
        res.status(400).json({
            error: 'Unsupported file type',
            details: err.message,
        });
        return;
    }
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development'
            ? err.message
            : 'An unexpected error occurred',
    });
});
// ─── Start server ─────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  \x1b[36m╔══════════════════════════════════════╗\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   WebGrab Server v1.0.0              \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m                                      \x1b[36m║\x1b[0m');
    console.log(`  \x1b[36m║\x1b[0m   Listening on http://${HOST}:${PORT}   \x1b[36m║\x1b[0m`);
    console.log('  \x1b[36m║\x1b[0m                                      \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   Endpoints:                         \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   GET  /api/health                   \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   POST /api/capture-url              \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   POST /api/parse-html               \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   POST /api/parse-file               \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m║\x1b[0m   GET  /api/proxy-asset              \x1b[36m║\x1b[0m');
    console.log('  \x1b[36m╚══════════════════════════════════════╝\x1b[0m');
    console.log('');
});
// ─── Graceful shutdown ────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    // Close the HTTP server (stop accepting new connections)
    server.close(() => {
        console.log('[shutdown] HTTP server closed');
    });
    // Close the Puppeteer browser
    try {
        await (0, renderer_js_1.closeBrowser)();
        console.log('[shutdown] Puppeteer browser closed');
    }
    catch (err) {
        console.error('[shutdown] Error closing browser:', err);
    }
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
        console.error('[shutdown] Forced exit after timeout');
        process.exit(1);
    }, 10000).unref();
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Handle uncaught errors
process.on('uncaughtException', (err) => {
    console.error('\x1b[31m[FATAL] Uncaught exception:\x1b[0m', err);
    shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[FATAL] Unhandled rejection:\x1b[0m', reason);
});
exports.default = app;
//# sourceMappingURL=index.js.map