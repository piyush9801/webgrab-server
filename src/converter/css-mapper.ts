/**
 * CSS-to-Figma Property Mapping Utilities
 *
 * Converts CSS properties extracted from computed styles into
 * Figma-compatible property values.
 */

import {
  parseColor,
  parseGradient,
  parseBorder,
  parseBoxShadow,
  parseFontWeight,
  parsePixelValue,
  parseTransform,
  isTransparent,
  type RGBAColor,
  type ParsedShadow,
  type ParsedGradient,
  type ParsedBorder,
  type ParsedTransform,
} from '../engine/style-extractor.js';

// ─── Figma fill/stroke/effect types ───────────────────────────────────

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'IMAGE';
  color?: RGBAColor;
  opacity?: number;
  gradientStops?: Array<{ position: number; color: RGBAColor }>;
  gradientTransform?: number[][]; // 2x3 matrix
  imageUrl?: string;
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
}

export interface FigmaStroke {
  type: 'SOLID';
  color: RGBAColor;
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  color?: RGBAColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  visible?: boolean;
}

export interface FigmaAutoLayout {
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems: string;
  counterAxisAlignItems: string;
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  layoutWrap?: 'WRAP' | 'NO_WRAP';
}

// ─── Flex to Auto Layout ──────────────────────────────────────────────

/**
 * Converts CSS flex properties to Figma auto-layout configuration.
 */
export function mapFlexToAutoLayout(styles: Record<string, string>): FigmaAutoLayout | null {
  const display = styles.display;
  if (display !== 'flex' && display !== 'inline-flex') {
    return null;
  }

  const direction = styles.flexDirection || 'row';
  const isColumn = direction === 'column' || direction === 'column-reverse';

  // Map flex-direction to Figma layoutMode
  const layoutMode: 'HORIZONTAL' | 'VERTICAL' = isColumn ? 'VERTICAL' : 'HORIZONTAL';

  // Map justify-content to primaryAxisAlignItems
  const justifyContent = styles.justifyContent || 'flex-start';
  const primaryAxisAlignItems = mapJustifyContent(justifyContent);

  // Map align-items to counterAxisAlignItems
  const alignItems = styles.alignItems || 'stretch';
  const counterAxisAlignItems = mapAlignItems(alignItems);

  // Gap
  const gap = parsePixelValue(styles.gap || '0');
  const rowGap = parsePixelValue(styles.rowGap || '0');
  const columnGap = parsePixelValue(styles.columnGap || '0');

  // In Figma, itemSpacing follows the primary axis
  const itemSpacing = isColumn
    ? (rowGap || gap)
    : (columnGap || gap);

  // Padding
  const paddingTop = parsePixelValue(styles.paddingTop || '0');
  const paddingRight = parsePixelValue(styles.paddingRight || '0');
  const paddingBottom = parsePixelValue(styles.paddingBottom || '0');
  const paddingLeft = parsePixelValue(styles.paddingLeft || '0');

  // Wrap
  const flexWrap = styles.flexWrap || 'nowrap';
  const layoutWrap: 'WRAP' | 'NO_WRAP' = flexWrap === 'wrap' || flexWrap === 'wrap-reverse'
    ? 'WRAP'
    : 'NO_WRAP';

  return {
    layoutMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    itemSpacing,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    layoutWrap,
  };
}

function mapJustifyContent(value: string): string {
  switch (value) {
    case 'flex-start':
    case 'start':
      return 'MIN';
    case 'flex-end':
    case 'end':
      return 'MAX';
    case 'center':
      return 'CENTER';
    case 'space-between':
      return 'SPACE_BETWEEN';
    case 'space-around':
    case 'space-evenly':
      return 'SPACE_BETWEEN'; // Figma doesn't have space-around/evenly, closest is space-between
    default:
      return 'MIN';
  }
}

function mapAlignItems(value: string): string {
  switch (value) {
    case 'flex-start':
    case 'start':
      return 'MIN';
    case 'flex-end':
    case 'end':
      return 'MAX';
    case 'center':
      return 'CENTER';
    case 'stretch':
      return 'STRETCH';
    case 'baseline':
      return 'MIN'; // Figma doesn't have baseline, use MIN
    default:
      return 'MIN';
  }
}

// ─── Grid to Auto Layout ─────────────────────────────────────────────

/**
 * Best-effort conversion of CSS grid to Figma auto-layout.
 * CSS Grid doesn't map cleanly to Figma auto-layout, so we approximate.
 */
export function mapGridToAutoLayout(styles: Record<string, string>): FigmaAutoLayout | null {
  const display = styles.display;
  if (display !== 'grid' && display !== 'inline-grid') {
    return null;
  }

  const columns = styles.gridTemplateColumns || '';
  const rows = styles.gridTemplateRows || '';

  // Determine if it's more column-oriented or row-oriented
  const colCount = columns
    ? columns.split(/\s+/).filter((s) => s && s !== 'none').length
    : 0;
  const rowCount = rows
    ? rows.split(/\s+/).filter((s) => s && s !== 'none').length
    : 0;

  // If single column, treat as vertical. If single row or multiple columns, treat as horizontal wrap.
  let layoutMode: 'HORIZONTAL' | 'VERTICAL' = 'VERTICAL';
  let layoutWrap: 'WRAP' | 'NO_WRAP' = 'NO_WRAP';

  if (colCount > 1) {
    layoutMode = 'HORIZONTAL';
    layoutWrap = 'WRAP';
  } else if (colCount === 1 && rowCount >= 1) {
    layoutMode = 'VERTICAL';
  }

  // Map alignment properties
  const justifyContent = styles.justifyContent || 'start';
  const alignItems = styles.alignItems || 'stretch';

  const gap = parsePixelValue(styles.gap || '0');
  const rowGap = parsePixelValue(styles.rowGap || '0');
  const columnGap = parsePixelValue(styles.columnGap || '0');

  const itemSpacing = layoutMode === 'VERTICAL'
    ? (rowGap || gap)
    : (columnGap || gap);

  return {
    layoutMode,
    primaryAxisAlignItems: mapJustifyContent(justifyContent),
    counterAxisAlignItems: mapAlignItems(alignItems),
    itemSpacing,
    paddingTop: parsePixelValue(styles.paddingTop || '0'),
    paddingRight: parsePixelValue(styles.paddingRight || '0'),
    paddingBottom: parsePixelValue(styles.paddingBottom || '0'),
    paddingLeft: parsePixelValue(styles.paddingLeft || '0'),
    layoutWrap,
  };
}

// ─── Background mapping ───────────────────────────────────────────────

/**
 * Converts CSS background properties to Figma fills array.
 */
export function mapBackground(
  bgColor: string,
  bgImage: string,
  bgSize?: string
): FigmaFill[] {
  const fills: FigmaFill[] = [];

  // Background color
  if (bgColor) {
    const color = parseColor(bgColor);
    if (color && !isTransparent(color)) {
      fills.push({
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b, a: 1 },
        opacity: color.a,
      });
    }
  }

  // Background image (gradient or url)
  if (bgImage && bgImage !== 'none') {
    // Check for gradients
    const gradient = parseGradient(bgImage);
    if (gradient) {
      const figmaFill = gradientToFigmaFill(gradient);
      if (figmaFill) {
        fills.push(figmaFill);
      }
    }

    // Check for url() background images
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      fills.push({
        type: 'IMAGE',
        imageUrl: urlMatch[1],
        scaleMode: mapBgSizeToScaleMode(bgSize || 'auto'),
      });
    }
  }

  return fills;
}

function gradientToFigmaFill(gradient: ParsedGradient): FigmaFill | null {
  if (gradient.stops.length < 2) return null;

  let type: FigmaFill['type'];
  switch (gradient.type) {
    case 'linear':
      type = 'GRADIENT_LINEAR';
      break;
    case 'radial':
      type = 'GRADIENT_RADIAL';
      break;
    case 'conic':
      type = 'GRADIENT_ANGULAR';
      break;
    default:
      type = 'GRADIENT_LINEAR';
  }

  const gradientStops = gradient.stops.map((stop) => ({
    position: stop.position,
    color: stop.color,
  }));

  // Compute gradient transform from angle (for linear gradients)
  let gradientTransform: number[][] | undefined;
  if (gradient.type === 'linear') {
    gradientTransform = angleToGradientTransform(gradient.angle);
  }

  return {
    type,
    gradientStops,
    gradientTransform,
  };
}

/**
 * Convert a CSS gradient angle to a Figma gradient transform (2x3 affine matrix).
 * CSS angles: 0deg = bottom-to-top, 90deg = left-to-right, 180deg = top-to-bottom
 * Figma gradient transforms map the unit square [0,1]x[0,1] gradient space to the node.
 */
function angleToGradientTransform(angleDeg: number): number[][] {
  // Convert CSS angle to radians
  // CSS: 0deg = to top, clockwise. We need to convert to standard math angles.
  const rad = ((angleDeg - 90) * Math.PI) / 180;

  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Center the rotation around (0.5, 0.5)
  const cx = 0.5;
  const cy = 0.5;

  // Affine transform: rotate around center
  // [cos, sin, tx]
  // [-sin, cos, ty]
  const tx = cx - cx * cos - cy * sin;
  const ty = cy + cx * sin - cy * cos;

  return [
    [cos, sin, tx],
    [-sin, cos, ty],
  ];
}

function mapBgSizeToScaleMode(bgSize: string): 'FILL' | 'FIT' | 'CROP' | 'TILE' {
  switch (bgSize) {
    case 'cover':
      return 'FILL';
    case 'contain':
      return 'FIT';
    case 'auto':
    case 'auto auto':
      return 'FILL';
    default:
      return 'FILL';
  }
}

// ─── Border mapping ───────────────────────────────────────────────────

export interface FigmaBorderResult {
  strokes: FigmaStroke[];
  strokeWeight: number;
  strokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  strokeTopWeight?: number;
  strokeRightWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
}

/**
 * Converts CSS border properties to Figma strokes.
 */
export function mapBorder(styles: Record<string, string>): FigmaBorderResult | null {
  const top = parseBorder(
    styles.borderTopWidth || '0',
    styles.borderTopStyle || 'none',
    styles.borderTopColor || 'transparent'
  );
  const right = parseBorder(
    styles.borderRightWidth || '0',
    styles.borderRightStyle || 'none',
    styles.borderRightColor || 'transparent'
  );
  const bottom = parseBorder(
    styles.borderBottomWidth || '0',
    styles.borderBottomStyle || 'none',
    styles.borderBottomColor || 'transparent'
  );
  const left = parseBorder(
    styles.borderLeftWidth || '0',
    styles.borderLeftStyle || 'none',
    styles.borderLeftColor || 'transparent'
  );

  const borders = [top, right, bottom, left].filter(
    (b): b is ParsedBorder => b !== null
  );

  if (borders.length === 0) return null;

  // Use the first non-null border's color as the stroke color
  const primaryBorder = borders[0];

  // Check if all borders are the same
  const allSame =
    borders.length === 4 &&
    borders.every(
      (b) =>
        b.width === primaryBorder.width &&
        b.color.r === primaryBorder.color.r &&
        b.color.g === primaryBorder.color.g &&
        b.color.b === primaryBorder.color.b &&
        b.color.a === primaryBorder.color.a
    );

  const result: FigmaBorderResult = {
    strokes: [
      {
        type: 'SOLID',
        color: primaryBorder.color,
      },
    ],
    strokeWeight: primaryBorder.width,
    strokeAlign: 'INSIDE',
  };

  if (!allSame) {
    result.strokeTopWeight = top?.width ?? 0;
    result.strokeRightWeight = right?.width ?? 0;
    result.strokeBottomWeight = bottom?.width ?? 0;
    result.strokeLeftWeight = left?.width ?? 0;
  }

  return result;
}

// ─── Shadow mapping ───────────────────────────────────────────────────

/**
 * Converts CSS box-shadow to Figma effects array.
 */
export function mapShadow(boxShadow: string): FigmaEffect[] {
  const shadows = parseBoxShadow(boxShadow);
  return shadows.map((shadow: ParsedShadow) => ({
    type: shadow.inset ? ('INNER_SHADOW' as const) : ('DROP_SHADOW' as const),
    color: shadow.color,
    offset: { x: shadow.offsetX, y: shadow.offsetY },
    radius: shadow.blur,
    spread: shadow.spread,
    visible: true,
  }));
}

// ─── Font mapping ─────────────────────────────────────────────────────

export interface FigmaFontInfo {
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
}

/**
 * Maps CSS font properties to Figma-compatible font information.
 * Cleans up font-family strings and resolves weight/style.
 */
export function mapFont(
  fontFamily: string,
  fontWeight: string,
  fontStyle: string
): FigmaFontInfo {
  // Clean up font-family: remove quotes, pick the first family
  const families = fontFamily
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''));

  // Prefer non-generic families
  const genericFamilies = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
  ]);

  let selectedFamily = families[0] || 'Inter';

  // If the first family is generic, try to find a non-generic one
  for (const family of families) {
    if (!genericFamilies.has(family.toLowerCase())) {
      selectedFamily = family;
      break;
    }
  }

  // Map well-known system/web fonts to Figma equivalents
  const systemFontMap: Record<string, string> = {
    '-apple-system': 'SF Pro Display',
    'BlinkMacSystemFont': 'SF Pro Display',
    'SF Pro Display': 'SF Pro Display',
    'SF Pro Text': 'SF Pro Text',
    'SF Pro': 'SF Pro Display',
    'SF Mono': 'SF Mono',
    '.SFNSText': 'SF Pro Text',
    '.SFNSDisplay': 'SF Pro Display',
    'Segoe UI': 'Segoe UI',
    'Helvetica Neue': 'Helvetica Neue',
    'Helvetica': 'Helvetica',
    'Arial': 'Arial',
    'Times New Roman': 'Times New Roman',
    'Times': 'Times New Roman',
    'Georgia': 'Georgia',
    'Verdana': 'Verdana',
    'Tahoma': 'Tahoma',
    'Trebuchet MS': 'Trebuchet MS',
    'Courier New': 'Courier New',
    'Lucida Console': 'Lucida Console',
  };

  // Check system font map first
  for (const family of families) {
    const mapped = systemFontMap[family];
    if (mapped) {
      selectedFamily = mapped;
      break;
    }
  }

  // Map generic families to common Figma fonts
  const genericMap: Record<string, string> = {
    'sans-serif': 'Inter',
    serif: 'Georgia',
    monospace: 'Roboto Mono',
    cursive: 'Dancing Script',
    fantasy: 'Impact',
    'system-ui': 'Inter',
    'ui-sans-serif': 'Inter',
    'ui-serif': 'Georgia',
    'ui-monospace': 'Roboto Mono',
  };

  if (genericFamilies.has(selectedFamily.toLowerCase())) {
    selectedFamily = genericMap[selectedFamily.toLowerCase()] || 'Inter';
  }

  return {
    fontFamily: selectedFamily,
    fontWeight: parseFontWeight(fontWeight),
    fontStyle: fontStyle === 'italic' || fontStyle === 'oblique' ? 'italic' : 'normal',
  };
}

// ─── Border radius mapping ────────────────────────────────────────────

export interface FigmaCornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/**
 * Extracts individual corner radii from CSS border-radius properties.
 */
export function mapBorderRadius(styles: Record<string, string>): FigmaCornerRadius {
  return {
    topLeft: parsePixelValue(styles.borderTopLeftRadius || '0'),
    topRight: parsePixelValue(styles.borderTopRightRadius || '0'),
    bottomRight: parsePixelValue(styles.borderBottomRightRadius || '0'),
    bottomLeft: parsePixelValue(styles.borderBottomLeftRadius || '0'),
  };
}

// ─── Transform mapping ────────────────────────────────────────────────

/**
 * Extracts rotation from CSS transform for Figma.
 */
export function mapTransform(transformStr: string): ParsedTransform {
  return parseTransform(transformStr);
}

// ─── Sizing mapping ───────────────────────────────────────────────────

/**
 * Determines Figma layout sizing based on CSS width/flex properties.
 */
export function mapLayoutSizing(
  styles: Record<string, string>,
  parentStyles?: Record<string, string>
): { horizontal: 'FIXED' | 'HUG' | 'FILL'; vertical: 'FIXED' | 'HUG' | 'FILL' } {
  type SizingMode = 'FIXED' | 'HUG' | 'FILL';
  const result: { horizontal: SizingMode; vertical: SizingMode } = { horizontal: 'FIXED', vertical: 'FIXED' };

  if (!parentStyles) return result;

  const parentDisplay = parentStyles.display;
  const isFlexChild =
    parentDisplay === 'flex' || parentDisplay === 'inline-flex';
  const isGridChild =
    parentDisplay === 'grid' || parentDisplay === 'inline-grid';

  if (!isFlexChild && !isGridChild) return result;

  // Horizontal sizing
  const width = styles.width;
  const flexGrow = parseFloat(styles.flexGrow || '0');
  const alignSelf = styles.alignSelf || 'auto';

  if (isFlexChild) {
    const parentDirection = parentStyles.flexDirection || 'row';
    const isParentColumn = parentDirection === 'column' || parentDirection === 'column-reverse';

    if (isParentColumn) {
      // In a column container, primary axis is vertical
      if (flexGrow > 0) {
        result.vertical = 'FILL';
      }
      // Cross-axis (horizontal): stretch means fill
      const effectiveAlign = alignSelf !== 'auto' ? alignSelf : (parentStyles.alignItems || 'stretch');
      if (effectiveAlign === 'stretch') {
        result.horizontal = 'FILL';
      }
    } else {
      // In a row container, primary axis is horizontal
      if (flexGrow > 0) {
        result.horizontal = 'FILL';
      }
      // Cross-axis (vertical): stretch means fill
      const effectiveAlign = alignSelf !== 'auto' ? alignSelf : (parentStyles.alignItems || 'stretch');
      if (effectiveAlign === 'stretch') {
        result.vertical = 'FILL';
      }
    }
  }

  // Width: 100% in a flex context typically means FILL
  if (width === '100%' || width === styles.maxWidth) {
    result.horizontal = 'FILL';
  }

  const height = styles.height;
  if (height === '100%') {
    result.vertical = 'FILL';
  }

  return result;
}
