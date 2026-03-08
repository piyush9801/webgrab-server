/**
 * Puppeteer Rendering Engine
 *
 * Manages a singleton headless Chrome browser instance and provides methods
 * to render URLs or raw HTML, then extract the DOM tree.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { getDomWalkerScript, type RawDomNode } from './dom-walker.js';

// ─── Viewport presets ─────────────────────────────────────────────────

export interface Viewport {
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<string, Viewport> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

export type ViewportOption = 'desktop' | 'tablet' | 'mobile' | Viewport;

function resolveViewport(option?: ViewportOption): Viewport {
  if (!option) return VIEWPORT_PRESETS.desktop;
  if (typeof option === 'string') {
    return VIEWPORT_PRESETS[option] || VIEWPORT_PRESETS.desktop;
  }
  return option;
}

// ─── Singleton browser management ─────────────────────────────────────

let browserInstance: Browser | null = null;
let browserLaunching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Prevent multiple concurrent launches
  if (browserLaunching) {
    return browserLaunching;
  }

  browserLaunching = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--font-render-hinting=none',
    ],
    defaultViewport: null,
  });

  try {
    browserInstance = await browserLaunching;

    // Handle unexpected disconnection
    browserInstance.on('disconnected', () => {
      browserInstance = null;
      browserLaunching = null;
    });

    return browserInstance;
  } finally {
    browserLaunching = null;
  }
}

/**
 * Close the browser instance (for graceful shutdown).
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Ignore close errors
    }
    browserInstance = null;
    browserLaunching = null;
  }
}

// ─── Page setup helpers ───────────────────────────────────────────────

const RENDER_TIMEOUT = 30_000; // 30 seconds

async function setupPage(viewport: Viewport): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
  });

  // Set a reasonable user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Block unnecessary resource types to speed up rendering
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const resourceType = request.resourceType();
    const blockedTypes = ['media', 'websocket'];
    if (blockedTypes.includes(resourceType)) {
      request.abort();
    } else {
      request.continue();
    }
  });

  return page;
}

/**
 * Force-load all lazy images by:
 * 1. Removing loading="lazy" attributes
 * 2. Setting real src from data-src / data-lazy-src attributes
 * 3. Triggering <source> srcset evaluation in <picture> elements
 * 4. Using currentSrc which reflects the actually loaded image after srcset
 */
async function forceLazyImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Remove loading="lazy" and force eager loading
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      (img as HTMLImageElement).loading = 'eager';
    });

    // Set src from common lazy-loading data attributes
    document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original]').forEach((img) => {
      const imgEl = img as HTMLImageElement;
      const lazySrc =
        imgEl.getAttribute('data-src') ||
        imgEl.getAttribute('data-lazy-src') ||
        imgEl.getAttribute('data-original');
      if (lazySrc && !imgEl.src) {
        imgEl.src = lazySrc;
      }
    });

    // Handle <picture> elements - force load sources
    document.querySelectorAll('picture source[data-srcset]').forEach((source) => {
      const dataSrcset = source.getAttribute('data-srcset');
      if (dataSrcset) {
        source.setAttribute('srcset', dataSrcset);
      }
    });

    // Handle noscript fallback images (some sites put real images in noscript)
    document.querySelectorAll('noscript').forEach((noscript) => {
      const html = noscript.textContent || '';
      if (html.includes('<img')) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const imgs = temp.querySelectorAll('img');
        imgs.forEach((img) => {
          const parent = noscript.parentElement;
          if (parent) {
            parent.appendChild(img);
          }
        });
      }
    });
  });
}

/**
 * Scroll through the entire page to trigger lazy-loaded content.
 * Scrolls in chunks and waits between each chunk for images to load.
 */
async function scrollFullPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const scrollEl = document.scrollingElement || document.documentElement;
    const totalHeight = scrollEl.scrollHeight;
    const viewportHeight = window.innerHeight;
    const scrollStep = Math.floor(viewportHeight * 0.8); // 80% of viewport per step
    const maxScrolls = 100; // Safety limit
    const scrollDelay = 200; // ms between scrolls - enough for lazy triggers

    let scrolled = 0;
    let steps = 0;

    // Scroll down through the entire page
    while (scrolled < totalHeight && steps < maxScrolls) {
      scrollEl.scrollTop = scrolled;
      scrolled += scrollStep;
      steps++;
      await new Promise((r) => setTimeout(r, scrollDelay));
    }

    // Scroll to the very bottom to ensure everything is triggered
    scrollEl.scrollTop = totalHeight;
    await new Promise((r) => setTimeout(r, 500));

    // Scroll back to top
    scrollEl.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 300));
  });
}

async function extractDom(page: Page): Promise<RawDomNode | null> {
  const script = getDomWalkerScript();
  const result = await page.evaluate(script);
  return result as RawDomNode | null;
}

// ─── Public rendering methods ─────────────────────────────────────────

export interface RenderResult {
  domTree: RawDomNode;
  url: string;
  viewport: Viewport;
  title: string;
}

/**
 * Render a URL in headless Chrome and extract the DOM tree.
 */
export async function renderUrl(
  url: string,
  viewportOption?: ViewportOption
): Promise<RenderResult> {
  const viewport = resolveViewport(viewportOption);
  const page = await setupPage(viewport);

  try {
    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: RENDER_TIMEOUT,
    });

    // Extra wait for JS frameworks to render
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));

    // Force-load lazy images BEFORE scrolling
    await forceLazyImages(page);

    // Scroll through the entire page to trigger lazy-loaded content
    await scrollFullPage(page);

    // Force lazy images again (some get added dynamically during scroll)
    await forceLazyImages(page);

    // Wait for images to actually load after all lazy-loading is triggered
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.allSettled(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            // Timeout fallback
            setTimeout(resolve, 3000);
          });
        })
      );
    });

    // Short wait for any final rendering
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

    const title = await page.title();
    const domTree = await extractDom(page);

    if (!domTree) {
      throw new Error('Failed to extract DOM tree - page body is empty');
    }

    return {
      domTree,
      url,
      viewport,
      title,
    };
  } finally {
    await page.close();
  }
}

/**
 * Render raw HTML (with optional CSS) in headless Chrome and extract the DOM tree.
 */
export async function renderHtml(
  html: string,
  css?: string,
  viewportOption?: ViewportOption
): Promise<RenderResult> {
  const viewport = resolveViewport(viewportOption);
  const page = await setupPage(viewport);

  try {
    // Build a complete HTML document if the input is a fragment
    let fullHtml = html;

    if (!html.toLowerCase().includes('<!doctype') && !html.toLowerCase().includes('<html')) {
      fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${css ? `<style>${css}</style>` : ''}
</head>
<body>
  ${html}
</body>
</html>`;
    } else if (css) {
      // If it's a full document but CSS is provided separately, inject it
      const insertPoint = fullHtml.indexOf('</head>');
      if (insertPoint !== -1) {
        fullHtml =
          fullHtml.substring(0, insertPoint) +
          `<style>${css}</style>` +
          fullHtml.substring(insertPoint);
      } else {
        // No head tag - wrap CSS in a style tag and prepend
        fullHtml = `<style>${css}</style>` + fullHtml;
      }
    }

    // Use setContent instead of data URL for better CSS handling
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT,
    });

    // Small wait for any transitions/animations to settle
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

    const title = await page.title();
    const domTree = await extractDom(page);

    if (!domTree) {
      throw new Error('Failed to extract DOM tree - page body is empty');
    }

    return {
      domTree,
      url: 'local://html',
      viewport,
      title: title || 'HTML Preview',
    };
  } finally {
    await page.close();
  }
}
