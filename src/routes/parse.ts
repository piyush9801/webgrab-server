/**
 * Parse Route - POST /api/parse-html
 *
 * Accepts raw HTML (and optional CSS), renders it in headless Chrome,
 * and returns a Figma-compatible JSON structure.
 */

import { Router, type Request, type Response } from 'express';
import { renderHtml, type ViewportOption } from '../engine/renderer.js';
import { convertDomToFigma } from '../converter/dom-to-figma.js';

const router = Router();

interface ParseRequestBody {
  html: string;
  css?: string;
  viewport?: 'desktop' | 'tablet' | 'mobile' | { width: number; height: number };
}

router.post('/parse-html', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const body = req.body as ParseRequestBody;

    // Validate HTML
    if (!body.html || typeof body.html !== 'string') {
      res.status(400).json({
        error: 'Missing or invalid "html" parameter',
        details: 'Provide an HTML string in the request body',
      });
      return;
    }

    if (body.html.length > 50 * 1024 * 1024) {
      res.status(413).json({
        error: 'HTML content too large',
        details: 'Maximum HTML size is 50MB',
      });
      return;
    }

    // Validate CSS if provided
    const css = body.css && typeof body.css === 'string' ? body.css : undefined;

    // Resolve viewport
    let viewport: ViewportOption = 'desktop';
    if (body.viewport) {
      if (typeof body.viewport === 'string') {
        if (['desktop', 'tablet', 'mobile'].includes(body.viewport)) {
          viewport = body.viewport as 'desktop' | 'tablet' | 'mobile';
        }
      } else if (
        typeof body.viewport === 'object' &&
        typeof body.viewport.width === 'number' &&
        typeof body.viewport.height === 'number'
      ) {
        viewport = {
          width: Math.max(320, Math.min(3840, body.viewport.width)),
          height: Math.max(320, Math.min(3840, body.viewport.height)),
        };
      }
    }

    console.log(
      `[parse] Rendering HTML (${body.html.length} chars${css ? `, CSS: ${css.length} chars` : ''}) viewport: ${JSON.stringify(viewport)}`
    );

    // Render the HTML
    const renderResult = await renderHtml(body.html, css, viewport);

    console.log(`[parse] DOM extracted in ${Date.now() - startTime}ms`);

    // Determine server base URL
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3500';
    const serverBase = `${protocol}://${host}`;

    // Convert DOM tree to Figma format
    const figmaTree = convertDomToFigma(renderResult.domTree, {
      baseUrl: 'local://html',
      serverBase,
    });

    const elapsed = Date.now() - startTime;
    console.log(`[parse] Conversion complete in ${elapsed}ms`);

    res.json({
      success: true,
      data: {
        figmaTree,
        metadata: {
          title: renderResult.title,
          viewport: renderResult.viewport,
          renderTimeMs: elapsed,
          htmlSize: body.html.length,
          cssSize: css?.length || 0,
        },
      },
    });
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[parse] Error after ${elapsed}ms:`, error.message);

    res.status(500).json({
      error: 'Parse failed',
      details: error.message || 'Unknown error',
    });
  }
});

export default router;
