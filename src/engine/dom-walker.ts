/**
 * DOM Walker - Runs inside page.evaluate() to extract the full DOM tree
 * with computed styles and bounding rectangles.
 *
 * This function is serialized and injected into the Puppeteer page context,
 * so it must be completely self-contained (no external imports).
 */

export interface RawDomNode {
  nodeType: 'ELEMENT' | 'TEXT';
  tag?: string;
  id?: string;
  classes?: string[];
  bounds: { x: number; y: number; width: number; height: number };
  styles?: Record<string, string>;
  attributes?: Record<string, string>;
  textContent?: string;
  svgString?: string;
  pseudoBefore?: { content: string; styles: Record<string, string> } | null;
  pseudoAfter?: { content: string; styles: Record<string, string> } | null;
  children?: RawDomNode[];
}

/**
 * The list of CSS properties we extract via getComputedStyle.
 * Kept as a constant so both the walker and tests can reference it.
 */
export const EXTRACTED_STYLE_PROPERTIES: string[] = [
  'display',
  'position',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'color',
  'backgroundColor',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundRepeat',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationStyle',
  'textTransform',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'boxShadow',
  'overflow',
  'overflowX',
  'overflowY',
  'opacity',
  'visibility',
  'flexDirection',
  'flexWrap',
  'alignItems',
  'justifyContent',
  'gap',
  'rowGap',
  'columnGap',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridColumn',
  'gridRow',
  'transform',
  'zIndex',
  'cursor',
  'whiteSpace',
  'wordBreak',
  'textOverflow',
  'listStyleType',
  'objectFit',
  'objectPosition',
  'verticalAlign',
];

/**
 * Returns the function body string to be executed inside page.evaluate().
 * It walks the DOM starting from document.body and returns a RawDomNode tree.
 */
export function getDomWalkerScript(): string {
  return `
  (function walkDOM() {
    const STYLE_PROPS = ${JSON.stringify(EXTRACTED_STYLE_PROPERTIES)};

    function getDirectTextContent(element) {
      let text = '';
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const trimmed = child.textContent.trim();
          if (trimmed) {
            text += (text ? ' ' : '') + trimmed;
          }
        }
      }
      return text || null;
    }

    function extractStyles(element) {
      const computed = window.getComputedStyle(element);
      const styles = {};
      for (const prop of STYLE_PROPS) {
        styles[prop] = computed.getPropertyValue(
          prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
        );
      }
      return styles;
    }

    function extractPseudo(element, pseudo) {
      const computed = window.getComputedStyle(element, pseudo);
      const content = computed.getPropertyValue('content');
      if (!content || content === 'none' || content === 'normal') {
        return null;
      }
      const styles = {};
      for (const prop of STYLE_PROPS) {
        styles[prop] = computed.getPropertyValue(
          prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
        );
      }
      return { content: content.replace(/^["']|["']$/g, ''), styles };
    }

    function isVisible(element, rect, styles) {
      if (styles.display === 'none') return false;
      if (styles.visibility === 'hidden') return false;
      if (rect.width === 0 && rect.height === 0) return false;
      if (parseFloat(styles.opacity) === 0) return false;
      return true;
    }

    function walkElement(element) {
      // Skip script, style, noscript, link, meta tags
      const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'BR']);
      if (skipTags.has(element.tagName)) return null;

      const rect = element.getBoundingClientRect();
      const styles = extractStyles(element);

      if (!isVisible(element, rect, styles)) return null;

      const tag = element.tagName.toLowerCase();
      const node = {
        nodeType: 'ELEMENT',
        tag: tag,
        bounds: {
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        },
        styles: styles,
        children: [],
      };

      // ID
      if (element.id) {
        node.id = element.id;
      }

      // Classes
      if (element.classList && element.classList.length > 0) {
        node.classes = Array.from(element.classList);
      }

      // Attributes — comprehensive image source extraction
      const attrs = {};
      if (tag === 'img') {
        const imgEl = element;
        // currentSrc is the BEST source - it's what the browser actually loaded
        // after evaluating srcset, <picture> sources, etc.
        attrs.src = imgEl.currentSrc || imgEl.src || element.getAttribute('src') || '';
        attrs.alt = imgEl.alt || element.getAttribute('alt') || '';
        // Also capture srcset for fallback resolution
        if (imgEl.srcset || element.getAttribute('srcset')) {
          attrs.srcset = imgEl.srcset || element.getAttribute('srcset');
        }
        // Lazy-load data attributes
        if (element.getAttribute('data-src')) attrs['data-src'] = element.getAttribute('data-src');
        if (element.getAttribute('data-lazy-src')) attrs['data-lazy-src'] = element.getAttribute('data-lazy-src');
        if (element.getAttribute('data-original')) attrs['data-original'] = element.getAttribute('data-original');
        // If src is empty but we have data attributes, use them
        if (!attrs.src && attrs['data-src']) attrs.src = attrs['data-src'];
        if (!attrs.src && attrs['data-lazy-src']) attrs.src = attrs['data-lazy-src'];
        if (!attrs.src && attrs['data-original']) attrs.src = attrs['data-original'];
      }
      if (tag === 'picture') {
        // For <picture>, find the active <source> or the <img> inside
        const picImg = element.querySelector('img');
        if (picImg) {
          attrs.src = picImg.currentSrc || picImg.src || '';
          attrs.alt = picImg.alt || '';
          if (picImg.srcset) attrs.srcset = picImg.srcset;
        }
        // Get all source srcsets for fallback
        const sources = element.querySelectorAll('source');
        const srcsets = [];
        sources.forEach(function(s) {
          const ss = s.getAttribute('srcset');
          if (ss) srcsets.push(ss);
        });
        if (srcsets.length > 0) attrs['source-srcsets'] = srcsets.join(', ');
      }
      if (tag === 'a') {
        attrs.href = element.href || element.getAttribute('href') || '';
      }
      if (tag === 'input') {
        attrs.type = element.type || 'text';
        attrs.placeholder = element.placeholder || '';
        attrs.value = element.value || '';
      }
      if (tag === 'video') {
        attrs.src = element.src || element.getAttribute('src') || '';
        attrs.poster = element.poster || element.getAttribute('poster') || '';
        // Poster is an image we can display
        if (attrs.poster) attrs.src = attrs.poster;
      }
      if (tag === 'source') {
        attrs.src = element.src || element.getAttribute('src') || '';
        if (element.getAttribute('srcset')) attrs.srcset = element.getAttribute('srcset');
      }
      // Generic data-src for any element (divs with background lazy loading)
      if (tag !== 'img' && element.getAttribute('data-src')) {
        attrs['data-src'] = element.getAttribute('data-src');
      }
      if (element.getAttribute('role')) {
        attrs.role = element.getAttribute('role');
      }
      if (element.getAttribute('aria-label')) {
        attrs['aria-label'] = element.getAttribute('aria-label');
      }
      if (Object.keys(attrs).length > 0) {
        node.attributes = attrs;
      }

      // SVG - capture the entire SVG as a string
      if (tag === 'svg') {
        try {
          node.svgString = element.outerHTML;
        } catch (e) {
          // SVG serialization can fail in edge cases
        }
        // Don't recurse into SVG children - we have the full string
        return node;
      }

      // Pseudo-elements
      const before = extractPseudo(element, '::before');
      if (before) node.pseudoBefore = before;
      const after = extractPseudo(element, '::after');
      if (after) node.pseudoAfter = after;

      // Direct text content (only text nodes that are direct children)
      const directText = getDirectTextContent(element);
      if (directText) {
        node.textContent = directText;
      }

      // Recurse into child elements
      for (const child of element.children) {
        const childNode = walkElement(child);
        if (childNode) {
          node.children.push(childNode);
        }
      }

      return node;
    }

    // Start walking from body
    const body = document.body;
    if (!body) return null;

    const bodyRect = body.getBoundingClientRect();
    const result = walkElement(body);

    // Also capture viewport dimensions
    if (result) {
      result._viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };

      // Capture the body/html background if present
      const htmlStyles = window.getComputedStyle(document.documentElement);
      result._htmlBackground = {
        backgroundColor: htmlStyles.backgroundColor,
        backgroundImage: htmlStyles.backgroundImage,
      };
    }

    return result;
  })()
  `;
}
