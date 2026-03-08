/**
 * WebGrab Server - Main Entry Point
 *
 * Express server that provides the backend for the WebGrab Figma plugin.
 * Renders websites in headless Chrome, extracts DOM trees with computed styles,
 * and converts them to Figma-compatible JSON structures.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { closeBrowser } from './engine/renderer.js';

// Import routes
import captureRouter from './routes/capture.js';
import parseRouter from './routes/parse.js';
import uploadRouter from './routes/upload.js';
import proxyRouter from './routes/proxy.js';

// ─── Configuration ────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3500', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ─── Express app setup ────────────────────────────────────────────────

const app = express();

// CORS - allow all origins (Figma plugin runs in a sandbox)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 3600,
  })
);

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;

  // Log when response finishes
  _res.on('finish', () => {
    const elapsed = Date.now() - start;
    const status = _res.statusCode;
    const statusColor =
      status >= 500
        ? '\x1b[31m' // red
        : status >= 400
          ? '\x1b[33m' // yellow
          : '\x1b[32m'; // green
    console.log(
      `${statusColor}${status}\x1b[0m ${method} ${path} - ${elapsed}ms`
    );
  });

  next();
});

// ─── Health check ─────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    service: 'webgrab-server',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────

app.use('/api', captureRouter);
app.use('/api', parseRouter);
app.use('/api', uploadRouter);
app.use('/api', proxyRouter);

// ─── 404 handler ──────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
    details:
      process.env.NODE_ENV === 'development'
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

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Close the HTTP server (stop accepting new connections)
  server.close(() => {
    console.log('[shutdown] HTTP server closed');
  });

  // Close the Puppeteer browser
  try {
    await closeBrowser();
    console.log('[shutdown] Puppeteer browser closed');
  } catch (err) {
    console.error('[shutdown] Error closing browser:', err);
  }

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('[shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();

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

export default app;
