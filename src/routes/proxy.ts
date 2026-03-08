/**
 * Proxy Route - GET /api/proxy-asset
 *
 * Proxies asset requests (images, fonts, etc.) to avoid CORS issues
 * when the Figma plugin fetches resources from external origins.
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

// ─── Simple in-memory cache ───────────────────────────────────────────

interface CacheEntry {
  data: Buffer;
  contentType: string;
  timestamp: number;
}

const assetCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100; // Max cached entries
const MAX_ASSET_SIZE = 20 * 1024 * 1024; // 20MB max per asset

// Periodically clean expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of assetCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      assetCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

// ─── Content type inference ───────────────────────────────────────────

function inferContentType(url: string, responseHeaders: Headers): string {
  // Trust the response content-type header first
  const headerType = responseHeaders.get('content-type');
  if (headerType && !headerType.includes('text/html')) {
    return headerType.split(';')[0].trim();
  }

  // Infer from URL extension
  const urlPath = new URL(url).pathname.toLowerCase();

  const extMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',

    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',

    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',

    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',

    '.pdf': 'application/pdf',
  };

  for (const [ext, type] of Object.entries(extMap)) {
    if (urlPath.endsWith(ext)) {
      return type;
    }
  }

  return headerType || 'application/octet-stream';
}

// ─── Route handler ────────────────────────────────────────────────────

router.get('/proxy-asset', async (req: Request, res: Response): Promise<void> => {
  try {
    const url = req.query.url as string;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: 'Missing "url" query parameter',
      });
      return;
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({
        error: 'Invalid URL',
        details: `"${url}" is not a valid URL`,
      });
      return;
    }

    // Only allow http/https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      res.status(400).json({
        error: 'Invalid protocol',
        details: 'Only HTTP and HTTPS URLs are allowed',
      });
      return;
    }

    // Check cache
    const cached = assetCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.set({
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT',
      });
      res.send(cached.data);
      return;
    }

    // Fetch the asset
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          Referer: parsedUrl.origin,
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        res.status(response.status).json({
          error: 'Failed to fetch asset',
          details: `Remote server returned ${response.status} ${response.statusText}`,
        });
        return;
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_ASSET_SIZE) {
        res.status(413).json({
          error: 'Asset too large',
          details: `Asset exceeds maximum size of ${MAX_ASSET_SIZE / 1024 / 1024}MB`,
        });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > MAX_ASSET_SIZE) {
        res.status(413).json({
          error: 'Asset too large',
          details: `Asset exceeds maximum size of ${MAX_ASSET_SIZE / 1024 / 1024}MB`,
        });
        return;
      }

      const contentType = inferContentType(url, response.headers);

      // Cache the result
      if (assetCache.size >= MAX_CACHE_SIZE) {
        // Evict oldest entry
        let oldest: string | null = null;
        let oldestTime = Infinity;
        for (const [key, entry] of assetCache.entries()) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldest = key;
          }
        }
        if (oldest) {
          assetCache.delete(oldest);
        }
      }

      assetCache.set(url, {
        data: buffer,
        contentType,
        timestamp: Date.now(),
      });

      // Send response
      res.set({
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'X-Cache': 'MISS',
      });

      res.send(buffer);
    } catch (fetchError: any) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        res.status(504).json({
          error: 'Asset fetch timed out',
          details: 'The remote server did not respond within 15 seconds',
        });
        return;
      }

      throw fetchError;
    }
  } catch (error: any) {
    console.error('[proxy] Error:', error.message);
    res.status(500).json({
      error: 'Proxy failed',
      details: error.message || 'Unknown error',
    });
  }
});

// Handle CORS preflight
router.options('/proxy-asset', (_req: Request, res: Response) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '3600',
  });
  res.sendStatus(204);
});

export default router;
