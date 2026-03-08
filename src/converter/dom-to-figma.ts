/**
 * DOM-to-Figma Converter
 *
 * Transforms a RawDomNode tree (extracted from Puppeteer) into a
 * Figma-compatible JSON structure that the Figma plugin can directly consume.
 */

import type { RawDomNode } from '../engine/dom-walker.js';
import {
  mapFlexToAutoLayout,
  mapGridToAutoLayout,
  mapBackground,
  mapBorder,
  mapShadow,
  mapFont,
  mapBorderRadius,
  mapTransform,
  mapLayoutSizing,
  type FigmaFill,
  type FigmaStroke,
  type FigmaEffect,
  type FigmaAutoLayout,
  type FigmaBorderResult,
} from './css-mapper.js';
import {
  resolveImageUrl,
  extractBestImageUrl,
} from './asset-resolver.js';
import {
  parseColor,
  parsePixelValue,
  parseLineHeight,
  parseLetterSpacing,
  parseFontWeight,
  type RGBAColor,
} from '../engine/style-extractor.js';

// ─── FigmaNode type definitions ───────────────────────────────────────

export interface FigmaNode {
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR' | 'GROUP';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;

  // Auto-layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutWrap?: 'WRAP' | 'NO_WRAP';

  // Visual
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  strokeTopWeight?: number;
  strokeRightWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  effects?: FigmaEffect[];
  cornerRadius?:
    | number
    | { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
  opacity?: number;
  clipsContent?: boolean;
  rotation?: number;
  visible?: boolean;

  // Text
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT';
  lineHeight?: number | { unit: 'AUTO' };
  letterSpacing?: number;
  textDecoration?: string;
  textCase?: string;
  textColor?: RGBAColor;

  // Image
  imageUrl?: string;

  // SVG
  svgString?: string;

  // Children
  children?: FigmaNode[];
}

// ─── Conversion options ───────────────────────────────────────────────

export interface ConversionOptions {
  baseUrl: string;
  serverBase: string;
  includeInvisible?: boolean;
}

// ─── Main conversion function ─────────────────────────────────────────

/**
 * Converts a RawDomNode tree to a Figma-compatible node tree.
 */
export function convertDomToFigma(
  domTree: RawDomNode,
  options: ConversionOptions
): FigmaNode {
  // Root node is never null because isRoot=true skips all filtering
  const rootNode = convertNode(domTree, null, options, true)!;

  // Wrap in a top-level frame that represents the page
  const viewport = (domTree as any)._viewport || { width: 1440, height: 900 };

  const pageFrame: FigmaNode = {
    type: 'FRAME',
    name: 'Page',
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.scrollHeight || viewport.height,
    fills: rootNode.fills || [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    clipsContent: true,
    children: rootNode.children || [rootNode],
  };

  // If there's an HTML background, apply it to the page frame
  const htmlBg = (domTree as any)._htmlBackground;
  if (htmlBg) {
    const htmlFills = mapBackground(htmlBg.backgroundColor, htmlBg.backgroundImage);
    if (htmlFills.length > 0 && (!pageFrame.fills || pageFrame.fills.length === 0)) {
      pageFrame.fills = htmlFills;
    }
  }

  return pageFrame;
}

// ─── Node conversion ──────────────────────────────────────────────────

function convertNode(
  raw: RawDomNode,
  parentRaw: RawDomNode | null,
  options: ConversionOptions,
  isRoot: boolean = false
): FigmaNode | null {
  const styles = raw.styles || {};
  const tag = raw.tag || 'div';

  // Determine Figma node type
  const nodeType = determineNodeType(raw);

  // ── Skip zero-size and offscreen elements (except root, TEXT, SVG) ──
  if (!isRoot && nodeType !== 'TEXT' && nodeType !== 'VECTOR' && !raw.svgString) {
    const w = raw.bounds.width;
    const h = raw.bounds.height;
    if (w < 2 && h < 2) {
      return null;
    }
    if (raw.bounds.x < -5000 || raw.bounds.y < -5000) {
      return null;
    }
  }

  // Build the Figma node name
  const name = buildNodeName(raw);

  // Compute position relative to parent
  const parentBounds = parentRaw?.bounds || { x: 0, y: 0, width: 0, height: 0 };
  const x = raw.bounds.x - parentBounds.x;
  const y = raw.bounds.y - parentBounds.y;

  const node: FigmaNode = {
    type: nodeType,
    name,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.max(1, Math.round(raw.bounds.width * 100) / 100),
    height: Math.max(1, Math.round(raw.bounds.height * 100) / 100),
  };

  // ── Handle SVG elements ───────────────────────────────────────────
  if (raw.svgString) {
    node.type = 'VECTOR';
    node.svgString = raw.svgString;
    return node;
  }

  // ── Handle text nodes ─────────────────────────────────────────────
  if (nodeType === 'TEXT') {
    applyTextProperties(node, raw, options);
    return node;
  }

  // ── Handle images ─────────────────────────────────────────────────
  if (tag === 'img' || tag === 'video' || tag === 'picture') {
    applyImageProperties(node, raw, options);
  }

  // ── Apply visual properties ───────────────────────────────────────
  applyVisualProperties(node, raw, options);

  // ── Apply layout properties ───────────────────────────────────────
  applyLayoutProperties(node, raw, parentRaw);

  // ── Apply position:absolute/fixed ─────────────────────────────────
  const position = styles.position;
  if (position === 'absolute' || position === 'fixed') {
    // Absolute positioning within parent
    node.layoutSizingHorizontal = 'FIXED';
    node.layoutSizingVertical = 'FIXED';
  }

  // ── Convert children ──────────────────────────────────────────────
  if (raw.children && raw.children.length > 0) {
    node.children = [];

    for (const childRaw of raw.children) {
      const childNode = convertNode(childRaw, raw, options);
      if (childNode) {
        node.children.push(childNode);
      }
    }
  }

  // ── Handle pseudo-elements ────────────────────────────────────────
  if (raw.pseudoBefore && raw.pseudoBefore.content) {
    const pseudoNode = createPseudoElement(raw.pseudoBefore, '::before', raw, options);
    if (pseudoNode) {
      node.children = node.children || [];
      node.children.unshift(pseudoNode);
    }
  }

  if (raw.pseudoAfter && raw.pseudoAfter.content) {
    const pseudoNode = createPseudoElement(raw.pseudoAfter, '::after', raw, options);
    if (pseudoNode) {
      node.children = node.children || [];
      node.children.push(pseudoNode);
    }
  }

  // ── If element has both text content and children, create a text child ──
  if (raw.textContent && node.children && node.children.length > 0) {
    const textChild = createTextNode(raw.textContent, raw, options);
    node.children.unshift(textChild);
  }

  // ── Skip empty transparent frames (no fills, strokes, effects, or children) ──
  if (
    !isRoot &&
    node.type === 'FRAME' &&
    (!node.children || node.children.length === 0) &&
    (!node.fills || node.fills.length === 0) &&
    (!node.strokes || node.strokes.length === 0) &&
    (!node.effects || node.effects.length === 0)
  ) {
    return null;
  }

  return node;
}

// ─── Node type determination ──────────────────────────────────────────

function determineNodeType(raw: RawDomNode): FigmaNode['type'] {
  const tag = raw.tag || 'div';

  // SVG
  if (tag === 'svg' || raw.svgString) {
    return 'VECTOR';
  }

  // Text-only elements (no children, has text content)
  const isTextElement =
    raw.textContent &&
    (!raw.children || raw.children.length === 0) &&
    !raw.svgString;

  const textTags = new Set([
    'p',
    'span',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'label',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'small',
    'sub',
    'sup',
    'abbr',
    'cite',
    'code',
    'pre',
    'blockquote',
    'q',
    'li',
    'dt',
    'dd',
    'figcaption',
    'caption',
    'th',
    'td',
    'button',
    'time',
    'mark',
  ]);

  if (isTextElement && textTags.has(tag)) {
    return 'TEXT';
  }

  if (isTextElement && tag === 'div') {
    return 'TEXT';
  }

  // Input elements with text
  if ((tag === 'input' || tag === 'textarea') && raw.textContent) {
    return 'TEXT';
  }

  // Everything else is a FRAME
  return 'FRAME';
}

// ─── Name building ────────────────────────────────────────────────────

function buildNodeName(raw: RawDomNode): string {
  const tag = raw.tag || 'div';

  // Use ID if available
  if (raw.id) {
    return `#${raw.id}`;
  }

  // Use first meaningful class
  if (raw.classes && raw.classes.length > 0) {
    // Filter out utility classes that are too cryptic
    const meaningfulClass = raw.classes.find(
      (c) => c.length > 2 && !c.startsWith('_') && !/^[a-z]{1,2}\d+/.test(c)
    );
    if (meaningfulClass) {
      return `.${meaningfulClass}`;
    }
    return `.${raw.classes[0]}`;
  }

  // Use aria-label
  if (raw.attributes?.['aria-label']) {
    return raw.attributes['aria-label'];
  }

  // Use alt text for images
  if (tag === 'img' && raw.attributes?.alt) {
    return raw.attributes.alt;
  }

  // Use tag name with truncated text
  if (raw.textContent) {
    const truncated =
      raw.textContent.length > 30
        ? raw.textContent.substring(0, 30) + '...'
        : raw.textContent;
    return `<${tag}> ${truncated}`;
  }

  return `<${tag}>`;
}

// ─── Visual properties ────────────────────────────────────────────────

function applyVisualProperties(
  node: FigmaNode,
  raw: RawDomNode,
  options: ConversionOptions
): void {
  const styles = raw.styles || {};

  // ── Fills (background) ──────────────────────────────────────────
  const bgColor = styles.backgroundColor || '';
  const bgImage = styles.backgroundImage || '';
  const bgSize = styles.backgroundSize || '';

  const fills = mapBackground(bgColor, bgImage, bgSize);

  // Resolve background image URLs to absolute URLs
  for (const fill of fills) {
    if (fill.type === 'IMAGE' && fill.imageUrl) {
      fill.imageUrl = resolveImageUrl(fill.imageUrl, options.baseUrl);
    }
  }

  if (fills.length > 0) {
    node.fills = fills;
  }

  // ── Borders (strokes) ──────────────────────────────────────────
  const borderResult = mapBorder(styles);
  if (borderResult) {
    node.strokes = borderResult.strokes;
    node.strokeWeight = borderResult.strokeWeight;
    node.strokeAlign = borderResult.strokeAlign;
    if (borderResult.strokeTopWeight !== undefined) {
      node.strokeTopWeight = borderResult.strokeTopWeight;
      node.strokeRightWeight = borderResult.strokeRightWeight;
      node.strokeBottomWeight = borderResult.strokeBottomWeight;
      node.strokeLeftWeight = borderResult.strokeLeftWeight;
    }
  }

  // ── Shadows (effects) ──────────────────────────────────────────
  const boxShadow = styles.boxShadow || '';
  const effects = mapShadow(boxShadow);
  if (effects.length > 0) {
    node.effects = effects;
  }

  // ── Border radius ──────────────────────────────────────────────
  const radius = mapBorderRadius(styles);
  const allSameRadius =
    radius.topLeft === radius.topRight &&
    radius.topRight === radius.bottomRight &&
    radius.bottomRight === radius.bottomLeft;

  if (radius.topLeft > 0 || radius.topRight > 0 || radius.bottomRight > 0 || radius.bottomLeft > 0) {
    if (allSameRadius) {
      node.cornerRadius = radius.topLeft;
    } else {
      node.cornerRadius = radius;
    }
  }

  // ── Opacity ────────────────────────────────────────────────────
  const opacity = parseFloat(styles.opacity || '1');
  if (opacity < 1) {
    node.opacity = Math.round(opacity * 100) / 100;
  }

  // ── Overflow / clips content ───────────────────────────────────
  const overflow = styles.overflow || 'visible';
  const overflowX = styles.overflowX || 'visible';
  const overflowY = styles.overflowY || 'visible';
  if (
    overflow === 'hidden' ||
    overflow === 'scroll' ||
    overflow === 'auto' ||
    overflowX === 'hidden' ||
    overflowY === 'hidden'
  ) {
    node.clipsContent = true;
  }

  // ── Transform (rotation) ───────────────────────────────────────
  const transform = styles.transform || '';
  if (transform && transform !== 'none') {
    const parsed = mapTransform(transform);
    if (parsed.rotation !== 0) {
      node.rotation = parsed.rotation;
    }
  }
}

// ─── Layout properties ────────────────────────────────────────────────

function applyLayoutProperties(
  node: FigmaNode,
  raw: RawDomNode,
  parentRaw: RawDomNode | null
): void {
  const styles = raw.styles || {};

  // ── Auto-layout from flex ──────────────────────────────────────
  const flexLayout = mapFlexToAutoLayout(styles);
  if (flexLayout) {
    applyAutoLayout(node, flexLayout);
    return;
  }

  // ── Auto-layout from grid ──────────────────────────────────────
  const gridLayout = mapGridToAutoLayout(styles);
  if (gridLayout) {
    applyAutoLayout(node, gridLayout);
    return;
  }

  // ── Layout sizing based on parent (only for flex/grid children) ──
  const parentDisplay = parentRaw?.styles?.display || '';
  const parentIsFlexOrGrid =
    parentDisplay === 'flex' ||
    parentDisplay === 'inline-flex' ||
    parentDisplay === 'grid' ||
    parentDisplay === 'inline-grid';

  if (parentIsFlexOrGrid && parentRaw?.styles) {
    const sizing = mapLayoutSizing(styles, parentRaw.styles);
    node.layoutSizingHorizontal = sizing.horizontal;
    node.layoutSizingVertical = sizing.vertical;
  }
}

function applyAutoLayout(node: FigmaNode, layout: FigmaAutoLayout): void {
  node.layoutMode = layout.layoutMode;
  node.primaryAxisAlignItems = layout.primaryAxisAlignItems;
  node.counterAxisAlignItems = layout.counterAxisAlignItems;
  node.itemSpacing = layout.itemSpacing;
  node.paddingTop = layout.paddingTop;
  node.paddingRight = layout.paddingRight;
  node.paddingBottom = layout.paddingBottom;
  node.paddingLeft = layout.paddingLeft;
  if (layout.layoutWrap) {
    node.layoutWrap = layout.layoutWrap;
  }
}

// ─── Text properties ──────────────────────────────────────────────────

function applyTextProperties(
  node: FigmaNode,
  raw: RawDomNode,
  options: ConversionOptions
): void {
  const styles = raw.styles || {};
  const text = raw.textContent || '';

  node.type = 'TEXT';
  node.characters = text;

  // Font
  const fontInfo = mapFont(
    styles.fontFamily || 'Inter',
    styles.fontWeight || '400',
    styles.fontStyle || 'normal'
  );

  node.fontFamily = fontInfo.fontFamily;
  node.fontWeight = fontInfo.fontWeight;
  node.fontStyle = fontInfo.fontStyle;

  // Font size
  const fontSize = parsePixelValue(styles.fontSize || '16px');
  node.fontSize = fontSize > 0 ? fontSize : 16;

  // Text color
  const color = parseColor(styles.color || 'rgb(0, 0, 0)');
  if (color) {
    node.textColor = color;
    node.fills = [
      {
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b, a: 1 },
        opacity: color.a,
      },
    ];
  }

  // Line height
  const lineHeight = parseLineHeight(styles.lineHeight || 'normal', node.fontSize);
  if (lineHeight !== null) {
    node.lineHeight = lineHeight;
  } else {
    node.lineHeight = { unit: 'AUTO' } as any;
  }

  // Letter spacing
  const letterSpacing = parseLetterSpacing(styles.letterSpacing || 'normal');
  if (letterSpacing !== 0) {
    node.letterSpacing = letterSpacing;
  }

  // Text alignment
  const textAlign = styles.textAlign || 'left';
  node.textAlignHorizontal = mapTextAlign(textAlign);
  node.textAlignVertical = 'TOP';
  node.textAutoResize = 'HEIGHT';

  // Text decoration
  const textDecLine = styles.textDecorationLine || styles.textDecoration || 'none';
  if (textDecLine.includes('underline')) {
    node.textDecoration = 'UNDERLINE';
  } else if (textDecLine.includes('line-through')) {
    node.textDecoration = 'STRIKETHROUGH';
  }

  // Text transform -> textCase
  const textTransform = styles.textTransform || 'none';
  node.textCase = mapTextTransform(textTransform);
}

function mapTextAlign(textAlign: string): string {
  switch (textAlign) {
    case 'left':
    case 'start':
      return 'LEFT';
    case 'right':
    case 'end':
      return 'RIGHT';
    case 'center':
      return 'CENTER';
    case 'justify':
      return 'JUSTIFIED';
    default:
      return 'LEFT';
  }
}

function mapTextTransform(textTransform: string): string {
  switch (textTransform) {
    case 'uppercase':
      return 'UPPER';
    case 'lowercase':
      return 'LOWER';
    case 'capitalize':
      return 'TITLE';
    default:
      return 'ORIGINAL';
  }
}

// ─── Image properties ─────────────────────────────────────────────────

function applyImageProperties(
  node: FigmaNode,
  raw: RawDomNode,
  options: ConversionOptions
): void {
  const attrs = raw.attributes || {};

  // Extract the best image URL
  let imageUrl = extractBestImageUrl(attrs);

  if (imageUrl) {
    // Resolve to absolute URL (no proxying — plugin handles fetching)
    imageUrl = resolveImageUrl(imageUrl, options.baseUrl);
    node.imageUrl = imageUrl;

    // Set a placeholder fill that the plugin will replace with the downloaded image
    node.fills = [
      {
        type: 'IMAGE',
        imageUrl,
        scaleMode: 'FILL',
      },
    ];
  }

  node.clipsContent = true;

  // Handle object-fit
  const objectFit = raw.styles?.objectFit || 'fill';
  if (node.fills && node.fills.length > 0 && node.fills[0].type === 'IMAGE') {
    switch (objectFit) {
      case 'cover':
        node.fills[0].scaleMode = 'FILL';
        break;
      case 'contain':
        node.fills[0].scaleMode = 'FIT';
        break;
      case 'fill':
        node.fills[0].scaleMode = 'FILL';
        break;
      case 'none':
        node.fills[0].scaleMode = 'CROP';
        break;
      default:
        node.fills[0].scaleMode = 'FILL';
    }
  }
}

// ─── Pseudo-element handling ──────────────────────────────────────────

function createPseudoElement(
  pseudo: { content: string; styles: Record<string, string> },
  name: string,
  parentRaw: RawDomNode,
  options: ConversionOptions
): FigmaNode | null {
  const content = pseudo.content;
  if (!content) return null;

  // Create a synthetic RawDomNode for the pseudo element
  const syntheticRaw: RawDomNode = {
    nodeType: 'ELEMENT',
    tag: 'span',
    bounds: {
      x: parentRaw.bounds.x,
      y: parentRaw.bounds.y,
      width: 0,
      height: 0,
    },
    styles: pseudo.styles,
    textContent: content,
  };

  const node: FigmaNode = {
    type: 'TEXT',
    name,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    characters: content,
  };

  // Apply text styling from pseudo styles
  const fontInfo = mapFont(
    pseudo.styles.fontFamily || parentRaw.styles?.fontFamily || 'Inter',
    pseudo.styles.fontWeight || parentRaw.styles?.fontWeight || '400',
    pseudo.styles.fontStyle || parentRaw.styles?.fontStyle || 'normal'
  );

  node.fontFamily = fontInfo.fontFamily;
  node.fontWeight = fontInfo.fontWeight;
  node.fontStyle = fontInfo.fontStyle;

  const fontSize = parsePixelValue(pseudo.styles.fontSize || parentRaw.styles?.fontSize || '16px');
  node.fontSize = fontSize > 0 ? fontSize : 16;

  const color = parseColor(pseudo.styles.color || parentRaw.styles?.color || 'rgb(0,0,0)');
  if (color) {
    node.textColor = color;
    node.fills = [
      {
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b, a: 1 },
        opacity: color.a,
      },
    ];
  }

  return node;
}

// ─── Text node creation ───────────────────────────────────────────────

function createTextNode(
  text: string,
  parentRaw: RawDomNode,
  options: ConversionOptions
): FigmaNode {
  const styles = parentRaw.styles || {};

  const node: FigmaNode = {
    type: 'TEXT',
    name: text.length > 30 ? text.substring(0, 30) + '...' : text,
    x: 0,
    y: 0,
    width: parentRaw.bounds.width,
    height: 0, // Will be determined by text content
    characters: text,
  };

  // Apply text styling from parent
  const fontInfo = mapFont(
    styles.fontFamily || 'Inter',
    styles.fontWeight || '400',
    styles.fontStyle || 'normal'
  );

  node.fontFamily = fontInfo.fontFamily;
  node.fontWeight = fontInfo.fontWeight;
  node.fontStyle = fontInfo.fontStyle;

  const fontSize = parsePixelValue(styles.fontSize || '16px');
  node.fontSize = fontSize > 0 ? fontSize : 16;

  const color = parseColor(styles.color || 'rgb(0, 0, 0)');
  if (color) {
    node.textColor = color;
    node.fills = [
      {
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b, a: 1 },
        opacity: color.a,
      },
    ];
  }

  const lineHeight = parseLineHeight(styles.lineHeight || 'normal', node.fontSize!);
  if (lineHeight !== null) {
    node.lineHeight = lineHeight;
  }

  const textAlign = styles.textAlign || 'left';
  node.textAlignHorizontal = mapTextAlign(textAlign);
  node.textAlignVertical = 'TOP';
  node.textAutoResize = 'HEIGHT';

  return node;
}
