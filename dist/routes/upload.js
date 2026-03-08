"use strict";
/**
 * Upload Route - POST /api/parse-file
 *
 * Handles file uploads (.html, .htm, .zip, .eml, .emlx, .msg),
 * extracts/parses HTML content, renders it, and returns Figma JSON.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const mailparser_1 = require("mailparser");
const renderer_js_1 = require("../engine/renderer.js");
const dom_to_figma_js_1 = require("../converter/dom-to-figma.js");
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const allowedExtensions = ['.html', '.htm', '.zip', '.eml', '.emlx', '.msg'];
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowedExtensions.join(', ')}`));
        }
    },
});
// ─── File type handlers ───────────────────────────────────────────────
async function handleHtmlFile(buffer) {
    return buffer.toString('utf-8');
}
async function handleZipFile(buffer) {
    const zip = new adm_zip_1.default(buffer);
    const entries = zip.getEntries();
    // Look for index.html first
    let htmlEntry = entries.find((e) => e.entryName.toLowerCase() === 'index.html' || e.entryName.toLowerCase().endsWith('/index.html'));
    // If no index.html, find the first .html or .htm file
    if (!htmlEntry) {
        htmlEntry = entries.find((e) => {
            const name = e.entryName.toLowerCase();
            return (name.endsWith('.html') || name.endsWith('.htm')) && !e.isDirectory;
        });
    }
    if (!htmlEntry) {
        throw new Error('No HTML file found in the ZIP archive');
    }
    let html = htmlEntry.getData().toString('utf-8');
    // Try to inline CSS files referenced in the HTML
    const cssPattern = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi;
    let match;
    while ((match = cssPattern.exec(html)) !== null) {
        const cssPath = match[1];
        // Look for the CSS file in the zip
        const cssEntry = entries.find((e) => {
            return (e.entryName === cssPath ||
                e.entryName.endsWith('/' + cssPath) ||
                e.entryName === cssPath.replace(/^\.\//, ''));
        });
        if (cssEntry) {
            const cssContent = cssEntry.getData().toString('utf-8');
            // Replace the link tag with an inline style tag
            html = html.replace(match[0], `<style>${cssContent}</style>`);
        }
    }
    // Try to inline JS files (for frameworks that need initialization)
    const jsPattern = /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi;
    while ((match = jsPattern.exec(html)) !== null) {
        const jsPath = match[1];
        const jsEntry = entries.find((e) => {
            return (e.entryName === jsPath ||
                e.entryName.endsWith('/' + jsPath) ||
                e.entryName === jsPath.replace(/^\.\//, ''));
        });
        if (jsEntry) {
            const jsContent = jsEntry.getData().toString('utf-8');
            html = html.replace(match[0], `<script>${jsContent}</script>`);
        }
    }
    return html;
}
async function handleEmailFile(buffer, ext) {
    try {
        const parsed = await (0, mailparser_1.simpleParser)(buffer);
        // Prefer HTML content
        if (parsed.html && typeof parsed.html === 'string') {
            return parsed.html;
        }
        // Fall back to text content wrapped in HTML
        if (parsed.text) {
            const escapedText = parsed.text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .email-header {
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .email-header p {
      margin: 4px 0;
      font-size: 13px;
    }
    .email-header strong {
      display: inline-block;
      width: 60px;
    }
  </style>
</head>
<body>
  <div class="email-header">
    ${parsed.from?.text ? `<p><strong>From:</strong> ${escapeHtml(parsed.from.text)}</p>` : ''}
    ${parsed.to ? `<p><strong>To:</strong> ${escapeHtml(Array.isArray(parsed.to) ? parsed.to.map(a => a.text).join(', ') : parsed.to.text || '')}</p>` : ''}
    ${parsed.subject ? `<p><strong>Subject:</strong> ${escapeHtml(parsed.subject)}</p>` : ''}
    ${parsed.date ? `<p><strong>Date:</strong> ${escapeHtml(parsed.date.toLocaleDateString())}</p>` : ''}
  </div>
  <div class="email-body">
    ${escapedText}
  </div>
</body>
</html>`;
        }
        throw new Error('No readable content found in email file');
    }
    catch (error) {
        if (error.message === 'No readable content found in email file') {
            throw error;
        }
        throw new Error(`Failed to parse email file: ${error.message}`);
    }
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
// ─── Route handler ────────────────────────────────────────────────────
router.post('/parse-file', upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    try {
        if (!req.file) {
            res.status(400).json({
                error: 'No file uploaded',
                details: 'Upload a file using the "file" form field',
            });
            return;
        }
        const file = req.file;
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        console.log(`[upload] Processing file: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB, type: ${ext})`);
        // Extract HTML from the file
        let html;
        switch (ext) {
            case '.html':
            case '.htm':
                html = await handleHtmlFile(file.buffer);
                break;
            case '.zip':
                html = await handleZipFile(file.buffer);
                break;
            case '.eml':
            case '.emlx':
            case '.msg':
                html = await handleEmailFile(file.buffer, ext);
                break;
            default:
                res.status(400).json({
                    error: `Unsupported file type: ${ext}`,
                    details: 'Supported: .html, .htm, .zip, .eml, .emlx, .msg',
                });
                return;
        }
        if (!html || html.trim().length === 0) {
            res.status(400).json({
                error: 'Empty file or no HTML content found',
            });
            return;
        }
        // Resolve viewport from query/body
        let viewport = 'desktop';
        const vpParam = (req.body?.viewport || req.query?.viewport);
        if (vpParam && ['desktop', 'tablet', 'mobile'].includes(vpParam)) {
            viewport = vpParam;
        }
        console.log(`[upload] Rendering extracted HTML (${html.length} chars)`);
        // Render the HTML
        const renderResult = await (0, renderer_js_1.renderHtml)(html, undefined, viewport);
        // Determine server base URL
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3500';
        const serverBase = `${protocol}://${host}`;
        // Convert to Figma format
        const figmaTree = (0, dom_to_figma_js_1.convertDomToFigma)(renderResult.domTree, {
            baseUrl: 'local://file',
            serverBase,
        });
        const elapsed = Date.now() - startTime;
        console.log(`[upload] Conversion complete in ${elapsed}ms`);
        res.json({
            success: true,
            data: {
                figmaTree,
                metadata: {
                    filename: file.originalname,
                    fileSize: file.size,
                    fileType: ext,
                    title: renderResult.title,
                    viewport: renderResult.viewport,
                    renderTimeMs: elapsed,
                },
            },
        });
    }
    catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[upload] Error after ${elapsed}ms:`, error.message);
        // Handle multer errors
        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                error: 'File too large',
                details: 'Maximum file size is 50MB',
            });
            return;
        }
        res.status(500).json({
            error: 'File processing failed',
            details: error.message || 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=upload.js.map