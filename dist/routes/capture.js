"use strict";
/**
 * Capture Route - POST /api/capture-url
 *
 * Accepts a URL, renders it in headless Chrome, extracts the DOM tree,
 * and returns a Figma-compatible JSON structure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const renderer_js_1 = require("../engine/renderer.js");
const dom_to_figma_js_1 = require("../converter/dom-to-figma.js");
const router = (0, express_1.Router)();
router.post('/capture-url', async (req, res) => {
    const startTime = Date.now();
    try {
        const body = req.body;
        // Validate URL
        if (!body.url || typeof body.url !== 'string') {
            res.status(400).json({
                error: 'Missing or invalid "url" parameter',
                details: 'Provide a valid URL string in the request body',
            });
            return;
        }
        // Normalize URL
        let url = body.url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        // Validate URL format
        try {
            new URL(url);
        }
        catch {
            res.status(400).json({
                error: 'Invalid URL format',
                details: `"${body.url}" is not a valid URL`,
            });
            return;
        }
        // Resolve viewport
        let viewport = 'desktop';
        if (body.viewport) {
            if (typeof body.viewport === 'string') {
                if (['desktop', 'tablet', 'mobile'].includes(body.viewport)) {
                    viewport = body.viewport;
                }
            }
            else if (typeof body.viewport === 'object' &&
                typeof body.viewport.width === 'number' &&
                typeof body.viewport.height === 'number') {
                viewport = {
                    width: Math.max(320, Math.min(3840, body.viewport.width)),
                    height: Math.max(320, Math.min(3840, body.viewport.height)),
                };
            }
        }
        console.log(`[capture] Rendering URL: ${url} (viewport: ${JSON.stringify(viewport)})`);
        // Render the URL
        const renderResult = await (0, renderer_js_1.renderUrl)(url, viewport);
        console.log(`[capture] DOM extracted in ${Date.now() - startTime}ms`);
        // Determine server base URL from request
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3500';
        const serverBase = `${protocol}://${host}`;
        // Convert DOM tree to Figma format
        const figmaTree = (0, dom_to_figma_js_1.convertDomToFigma)(renderResult.domTree, {
            baseUrl: url,
            serverBase,
        });
        const elapsed = Date.now() - startTime;
        console.log(`[capture] Conversion complete in ${elapsed}ms`);
        res.json({
            success: true,
            data: {
                figmaTree,
                metadata: {
                    url: renderResult.url,
                    title: renderResult.title,
                    viewport: renderResult.viewport,
                    renderTimeMs: elapsed,
                },
            },
        });
    }
    catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[capture] Error after ${elapsed}ms:`, error.message);
        // Check for common errors
        if (error.message?.includes('net::ERR_')) {
            res.status(502).json({
                error: 'Failed to load URL',
                details: error.message,
            });
            return;
        }
        if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
            res.status(504).json({
                error: 'Page load timed out',
                details: 'The page took too long to load (30s timeout)',
            });
            return;
        }
        res.status(500).json({
            error: 'Capture failed',
            details: error.message || 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=capture.js.map