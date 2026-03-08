/**
 * Asset Resolver - Handles resolution and proxying of images and fonts.
 */

// ─── Image URL resolution ─────────────────────────────────────────────

/**
 * Resolves a potentially relative image URL to an absolute URL.
 */
export function resolveImageUrl(src: string, baseUrl: string): string {
  if (!src) return '';

  // Already absolute
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  // Data URLs are already complete
  if (src.startsWith('data:')) {
    return src;
  }

  // Protocol-relative
  if (src.startsWith('//')) {
    return `https:${src}`;
  }

  // Relative URL - resolve against base
  try {
    const resolved = new URL(src, baseUrl);
    return resolved.href;
  } catch {
    // If URL resolution fails, try simple concatenation
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const path = src.startsWith('/') ? src.substring(1) : src;
    return base + path;
  }
}

/**
 * Extracts the best image URL from various attributes.
 * Priority: currentSrc/src > data-src > srcset > source-srcsets > data-lazy-src
 */
export function extractBestImageUrl(attributes: Record<string, string>): string {
  // Prefer src (which the DOM walker sets to currentSrc when available)
  // currentSrc is the best because the browser already resolved srcset/picture
  if (attributes.src) {
    // Skip tiny placeholder/tracking pixels and SVG data URIs
    if (attributes.src.startsWith('data:image/svg+xml')) {
      // Fall through to other sources
    } else if (attributes.src.startsWith('data:image/gif;base64,R0lGOD')) {
      // Common 1x1 tracking pixel, skip
    } else if (attributes.src.length > 10) {
      return attributes.src;
    }
  }

  // Lazy-loaded images via data attributes
  if (attributes['data-src'] && attributes['data-src'].length > 10) {
    return attributes['data-src'];
  }
  if (attributes['data-lazy-src'] && attributes['data-lazy-src'].length > 10) {
    return attributes['data-lazy-src'];
  }
  if (attributes['data-original'] && attributes['data-original'].length > 10) {
    return attributes['data-original'];
  }

  // srcset - pick the largest/best resolution
  if (attributes.srcset) {
    const best = pickBestFromSrcset(attributes.srcset);
    if (best) return best;
  }

  // <picture> source srcsets
  if (attributes['source-srcsets']) {
    const best = pickBestFromSrcset(attributes['source-srcsets']);
    if (best) return best;
  }

  // Video poster
  if (attributes.poster) {
    return attributes.poster;
  }

  // Fall back to src even if it's a data URL
  return attributes.src || '';
}

/**
 * Picks the highest resolution image from a srcset attribute.
 */
function pickBestFromSrcset(srcset: string): string {
  const entries = srcset.split(',').map((entry) => {
    const parts = entry.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts[1] || '1x';

    let size = 1;
    if (descriptor.endsWith('w')) {
      size = parseInt(descriptor, 10);
    } else if (descriptor.endsWith('x')) {
      size = parseFloat(descriptor) * 1000; // normalize x to comparable scale
    }

    return { url, size };
  });

  // Sort by size descending and pick the largest
  entries.sort((a, b) => b.size - a.size);
  return entries[0]?.url || '';
}

// ─── Proxy URL generation ─────────────────────────────────────────────

/**
 * Creates a proxy URL through our server to avoid CORS issues.
 */
export function proxyAssetUrl(originalUrl: string, serverBase: string): string {
  if (!originalUrl) return '';

  // Don't proxy data URLs
  if (originalUrl.startsWith('data:')) return originalUrl;

  // Don't proxy if it's already pointing to our server
  if (originalUrl.startsWith(serverBase)) return originalUrl;

  const encoded = encodeURIComponent(originalUrl);
  return `${serverBase}/api/proxy-asset?url=${encoded}`;
}

/**
 * Replaces all image URLs in a DOM tree with proxied versions.
 * Modifies the tree in place.
 */
export function proxyAllAssets(node: any, baseUrl: string, serverBase: string): void {
  if (!node) return;

  // Proxy image src
  if (node.attributes?.src) {
    const resolved = resolveImageUrl(node.attributes.src, baseUrl);
    node.attributes.src = resolved;
  }

  // Proxy data-src
  if (node.attributes?.['data-src']) {
    const resolved = resolveImageUrl(node.attributes['data-src'], baseUrl);
    node.attributes['data-src'] = resolved;
  }

  // Proxy background images in styles
  if (node.styles?.backgroundImage) {
    const bgImage = node.styles.backgroundImage;
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch && urlMatch[1]) {
      const resolved = resolveImageUrl(urlMatch[1], baseUrl);
      node.styles.backgroundImage = bgImage.replace(
        urlMatch[0],
        `url("${resolved}")`
      );
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      proxyAllAssets(child, baseUrl, serverBase);
    }
  }
}

// ─── Font resolution ──────────────────────────────────────────────────

/**
 * Common font family mappings from web fonts to Figma-available fonts.
 */
const FONT_FAMILY_MAP: Record<string, string> = {
  // System fonts
  '-apple-system': 'SF Pro Display',
  'BlinkMacSystemFont': 'SF Pro Display',
  'Segoe UI': 'Segoe UI',
  'Helvetica Neue': 'Helvetica Neue',
  Helvetica: 'Helvetica',
  Arial: 'Arial',
  'Noto Sans': 'Noto Sans',
  'Liberation Sans': 'Liberation Sans',

  // Google Fonts (common ones)
  Roboto: 'Roboto',
  'Open Sans': 'Open Sans',
  Lato: 'Lato',
  Montserrat: 'Montserrat',
  'Source Sans Pro': 'Source Sans Pro',
  'Source Code Pro': 'Source Code Pro',
  Poppins: 'Poppins',
  Raleway: 'Raleway',
  Oswald: 'Oswald',
  Nunito: 'Nunito',
  'Nunito Sans': 'Nunito Sans',
  'PT Sans': 'PT Sans',
  'PT Serif': 'PT Serif',
  Merriweather: 'Merriweather',
  'Playfair Display': 'Playfair Display',
  'DM Sans': 'DM Sans',
  'DM Serif Display': 'DM Serif Display',
  'Work Sans': 'Work Sans',
  'Space Grotesk': 'Space Grotesk',
  'Space Mono': 'Space Mono',
  'Fira Code': 'Fira Code',
  'JetBrains Mono': 'JetBrains Mono',
  'IBM Plex Sans': 'IBM Plex Sans',
  'IBM Plex Mono': 'IBM Plex Mono',
  'Plus Jakarta Sans': 'Plus Jakarta Sans',

  // Generic families
  'sans-serif': 'Inter',
  serif: 'Georgia',
  monospace: 'Roboto Mono',
  cursive: 'Dancing Script',
};

/**
 * Resolves a CSS font-family to the best available Figma font.
 */
export function resolveFont(fontFamily: string): string {
  // Clean up and get first family
  const families = fontFamily
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''));

  for (const family of families) {
    // Direct match
    if (FONT_FAMILY_MAP[family]) {
      return FONT_FAMILY_MAP[family];
    }

    // Case-insensitive match
    const lower = family.toLowerCase();
    for (const [key, value] of Object.entries(FONT_FAMILY_MAP)) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }

    // If not a generic family, assume it might be available in Figma
    const genericFamilies = new Set([
      'sans-serif',
      'serif',
      'monospace',
      'cursive',
      'fantasy',
      'system-ui',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
    ]);

    if (!genericFamilies.has(lower)) {
      return family; // Return as-is, Figma plugin will handle font loading
    }
  }

  return 'Inter'; // Ultimate fallback
}
