"use strict";
/**
 * Style Extractor - Parses raw CSS computed style strings into structured objects
 * suitable for conversion to Figma properties.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseColor = parseColor;
exports.isTransparent = isTransparent;
exports.parseBoxShadow = parseBoxShadow;
exports.parseGradient = parseGradient;
exports.parseBorder = parseBorder;
exports.parseTransform = parseTransform;
exports.parseFontWeight = parseFontWeight;
exports.parsePixelValue = parsePixelValue;
exports.parseLineHeight = parseLineHeight;
exports.parseLetterSpacing = parseLetterSpacing;
exports.splitByTopLevelComma = splitByTopLevelComma;
// ─── Color parsing ────────────────────────────────────────────────────
/**
 * Parses a CSS color string (rgb, rgba, hex, named) into an RGBAColor object.
 * Returns null for transparent/invalid colors.
 */
function parseColor(colorStr) {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'none') {
        return null;
    }
    const str = colorStr.trim();
    // rgba(r, g, b, a)
    const rgbaMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbaMatch) {
        return {
            r: clamp01(parseFloat(rgbaMatch[1]) / 255),
            g: clamp01(parseFloat(rgbaMatch[2]) / 255),
            b: clamp01(parseFloat(rgbaMatch[3]) / 255),
            a: rgbaMatch[4] !== undefined ? clamp01(parseFloat(rgbaMatch[4])) : 1,
        };
    }
    // Modern CSS color function: rgb(r g b / a) or rgba(r g b / a)
    const rgbSpaceMatch = str.match(/rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)/);
    if (rgbSpaceMatch) {
        const a = rgbSpaceMatch[4]
            ? rgbSpaceMatch[4].endsWith('%')
                ? parseFloat(rgbSpaceMatch[4]) / 100
                : parseFloat(rgbSpaceMatch[4])
            : 1;
        return {
            r: clamp01(parseFloat(rgbSpaceMatch[1]) / 255),
            g: clamp01(parseFloat(rgbSpaceMatch[2]) / 255),
            b: clamp01(parseFloat(rgbSpaceMatch[3]) / 255),
            a: clamp01(a),
        };
    }
    // Hex colors
    const hexMatch = str.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16) / 255,
                g: parseInt(hex[1] + hex[1], 16) / 255,
                b: parseInt(hex[2] + hex[2], 16) / 255,
                a: 1,
            };
        }
        if (hex.length === 4) {
            return {
                r: parseInt(hex[0] + hex[0], 16) / 255,
                g: parseInt(hex[1] + hex[1], 16) / 255,
                b: parseInt(hex[2] + hex[2], 16) / 255,
                a: parseInt(hex[3] + hex[3], 16) / 255,
            };
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16) / 255,
                g: parseInt(hex.substring(2, 4), 16) / 255,
                b: parseInt(hex.substring(4, 6), 16) / 255,
                a: 1,
            };
        }
        if (hex.length === 8) {
            return {
                r: parseInt(hex.substring(0, 2), 16) / 255,
                g: parseInt(hex.substring(2, 4), 16) / 255,
                b: parseInt(hex.substring(4, 6), 16) / 255,
                a: parseInt(hex.substring(6, 8), 16) / 255,
            };
        }
    }
    // Named colors (common ones)
    const namedColors = {
        black: { r: 0, g: 0, b: 0, a: 1 },
        white: { r: 1, g: 1, b: 1, a: 1 },
        red: { r: 1, g: 0, b: 0, a: 1 },
        green: { r: 0, g: 128 / 255, b: 0, a: 1 },
        blue: { r: 0, g: 0, b: 1, a: 1 },
        gray: { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 },
        grey: { r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1 },
        yellow: { r: 1, g: 1, b: 0, a: 1 },
        orange: { r: 1, g: 165 / 255, b: 0, a: 1 },
        purple: { r: 128 / 255, g: 0, b: 128 / 255, a: 1 },
        pink: { r: 1, g: 192 / 255, b: 203 / 255, a: 1 },
        cyan: { r: 0, g: 1, b: 1, a: 1 },
        magenta: { r: 1, g: 0, b: 1, a: 1 },
    };
    const lower = str.toLowerCase();
    if (namedColors[lower]) {
        return { ...namedColors[lower] };
    }
    return null;
}
/**
 * Checks if a color is effectively transparent.
 */
function isTransparent(color) {
    if (!color)
        return true;
    return color.a === 0;
}
// ─── Shadow parsing ───────────────────────────────────────────────────
/**
 * Parses a CSS box-shadow string into an array of ParsedShadow objects.
 * Handles multiple shadows separated by commas.
 */
function parseBoxShadow(shadowStr) {
    if (!shadowStr || shadowStr === 'none')
        return [];
    const shadows = [];
    // Split by commas that are not inside parentheses
    const parts = splitByTopLevelComma(shadowStr);
    for (const part of parts) {
        const shadow = parseSingleShadow(part.trim());
        if (shadow) {
            shadows.push(shadow);
        }
    }
    return shadows;
}
function parseSingleShadow(str) {
    let inset = false;
    let working = str;
    // Check for inset keyword
    if (working.startsWith('inset')) {
        inset = true;
        working = working.substring(5).trim();
    }
    // Extract color (it can be at the start or end)
    let color = { r: 0, g: 0, b: 0, a: 1 }; // default black
    // Try to find rgb/rgba color
    const colorMatch = working.match(/rgba?\([^)]+\)/);
    if (colorMatch) {
        const parsed = parseColor(colorMatch[0]);
        if (parsed)
            color = parsed;
        working = working.replace(colorMatch[0], '').trim();
    }
    else {
        // Try hex or named color at the end
        const tokens = working.split(/\s+/);
        const lastToken = tokens[tokens.length - 1];
        const parsed = parseColor(lastToken);
        if (parsed) {
            color = parsed;
            tokens.pop();
            working = tokens.join(' ');
        }
    }
    // Check for trailing inset
    working = working.trim();
    if (working.endsWith('inset')) {
        inset = true;
        working = working.replace(/\s*inset\s*$/, '').trim();
    }
    // Remaining should be: offsetX offsetY [blur [spread]]
    const values = working.split(/\s+/).map(parsePixelValue);
    if (values.length < 2)
        return null;
    return {
        offsetX: values[0],
        offsetY: values[1],
        blur: values[2] ?? 0,
        spread: values[3] ?? 0,
        color,
        inset,
    };
}
// ─── Gradient parsing ─────────────────────────────────────────────────
/**
 * Parses a CSS gradient string (linear-gradient, radial-gradient) into a
 * ParsedGradient object.
 */
function parseGradient(gradientStr) {
    if (!gradientStr || gradientStr === 'none')
        return null;
    const str = gradientStr.trim();
    // Linear gradient
    const linearMatch = str.match(/linear-gradient\((.+)\)/s);
    if (linearMatch) {
        return parseLinearGradient(linearMatch[1]);
    }
    // Radial gradient
    const radialMatch = str.match(/radial-gradient\((.+)\)/s);
    if (radialMatch) {
        return parseRadialGradient(radialMatch[1]);
    }
    // Conic gradient
    const conicMatch = str.match(/conic-gradient\((.+)\)/s);
    if (conicMatch) {
        return parseConicGradient(conicMatch[1]);
    }
    return null;
}
function parseLinearGradient(content) {
    const parts = splitByTopLevelComma(content);
    let angle = 180; // default top-to-bottom
    let stopStart = 0;
    // Check if first part is an angle or direction
    const first = parts[0].trim();
    const angleMatch = first.match(/^([\d.]+)deg$/);
    if (angleMatch) {
        angle = parseFloat(angleMatch[1]);
        stopStart = 1;
    }
    else if (first.startsWith('to ')) {
        angle = directionToAngle(first);
        stopStart = 1;
    }
    const stops = parseColorStops(parts.slice(stopStart));
    return { type: 'linear', angle, stops };
}
function parseRadialGradient(content) {
    const parts = splitByTopLevelComma(content);
    let stopStart = 0;
    // Skip shape/size/position declarations
    const first = parts[0].trim().toLowerCase();
    if (first.includes('circle') ||
        first.includes('ellipse') ||
        first.includes('at ') ||
        first.includes('closest') ||
        first.includes('farthest')) {
        stopStart = 1;
    }
    const stops = parseColorStops(parts.slice(stopStart));
    return { type: 'radial', angle: 0, stops };
}
function parseConicGradient(content) {
    const parts = splitByTopLevelComma(content);
    let angle = 0;
    let stopStart = 0;
    const first = parts[0].trim();
    const fromMatch = first.match(/from\s+([\d.]+)deg/);
    if (fromMatch) {
        angle = parseFloat(fromMatch[1]);
        stopStart = 1;
    }
    const stops = parseColorStops(parts.slice(stopStart));
    return { type: 'conic', angle, stops };
}
function parseColorStops(parts) {
    const stops = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part)
            continue;
        // Try to extract color and optional position
        let colorStr = part;
        let position = null;
        // Check for percentage at the end
        const posMatch = part.match(/([\d.]+%)\s*$/);
        if (posMatch) {
            position = parseFloat(posMatch[1]) / 100;
            colorStr = part.substring(0, part.length - posMatch[0].length).trim();
        }
        // Check for pixel value at the end (less common)
        const pxMatch = part.match(/([\d.]+)px\s*$/);
        if (!posMatch && pxMatch) {
            // We can't accurately convert px to percentage without knowing gradient length
            // Just use a proportional distribution
            position = null;
            colorStr = part.substring(0, part.length - pxMatch[0].length).trim();
        }
        const color = parseColor(colorStr);
        if (color) {
            if (position === null) {
                // Distribute evenly
                position = parts.length > 1 ? i / (parts.length - 1) : 0;
            }
            stops.push({ position, color });
        }
    }
    return stops;
}
function directionToAngle(direction) {
    const dir = direction.toLowerCase().trim();
    const map = {
        'to top': 0,
        'to top right': 45,
        'to right': 90,
        'to bottom right': 135,
        'to bottom': 180,
        'to bottom left': 225,
        'to left': 270,
        'to top left': 315,
    };
    return map[dir] ?? 180;
}
// ─── Border parsing ───────────────────────────────────────────────────
/**
 * Parses individual border properties into a structured ParsedBorder.
 */
function parseBorder(width, style, color) {
    const w = parsePixelValue(width);
    if (w <= 0 || style === 'none' || style === 'hidden') {
        return null;
    }
    return {
        width: w,
        style: style || 'solid',
        color: parseColor(color) || { r: 0, g: 0, b: 0, a: 1 },
    };
}
// ─── Transform parsing ───────────────────────────────────────────────
/**
 * Parses a CSS transform string to extract rotation, scale, and translate.
 */
function parseTransform(transformStr) {
    const result = {
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
    };
    if (!transformStr || transformStr === 'none')
        return result;
    // matrix(a, b, c, d, tx, ty)
    const matrixMatch = transformStr.match(/matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*\)/);
    if (matrixMatch) {
        const a = parseFloat(matrixMatch[1]);
        const b = parseFloat(matrixMatch[2]);
        // c = parseFloat(matrixMatch[3]);
        // d = parseFloat(matrixMatch[4]);
        const tx = parseFloat(matrixMatch[5]);
        const ty = parseFloat(matrixMatch[6]);
        result.rotation = Math.round((Math.atan2(b, a) * 180) / Math.PI * 100) / 100;
        result.scaleX = Math.sqrt(a * a + b * b);
        result.scaleY = Math.sqrt(parseFloat(matrixMatch[3]) ** 2 + parseFloat(matrixMatch[4]) ** 2);
        result.translateX = tx;
        result.translateY = ty;
        return result;
    }
    // rotate(Xdeg)
    const rotateMatch = transformStr.match(/rotate\(\s*([-\d.]+)deg\s*\)/);
    if (rotateMatch) {
        result.rotation = parseFloat(rotateMatch[1]);
    }
    // scale(x) or scale(x, y)
    const scaleMatch = transformStr.match(/scale\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)/);
    if (scaleMatch) {
        result.scaleX = parseFloat(scaleMatch[1]);
        result.scaleY = scaleMatch[2] ? parseFloat(scaleMatch[2]) : result.scaleX;
    }
    // translate(x, y) or translateX/translateY
    const translateMatch = transformStr.match(/translate\(\s*([-\d.]+)px(?:\s*,\s*([-\d.]+)px)?\s*\)/);
    if (translateMatch) {
        result.translateX = parseFloat(translateMatch[1]);
        result.translateY = translateMatch[2] ? parseFloat(translateMatch[2]) : 0;
    }
    return result;
}
// ─── Font weight parsing ──────────────────────────────────────────────
/**
 * Maps CSS font-weight strings to numeric values.
 */
function parseFontWeight(weight) {
    const map = {
        thin: 100,
        hairline: 100,
        extralight: 200,
        'extra-light': 200,
        ultralight: 200,
        'ultra-light': 200,
        light: 300,
        normal: 400,
        regular: 400,
        medium: 500,
        semibold: 600,
        'semi-bold': 600,
        demibold: 600,
        'demi-bold': 600,
        bold: 700,
        extrabold: 800,
        'extra-bold': 800,
        ultrabold: 800,
        'ultra-bold': 800,
        black: 900,
        heavy: 900,
    };
    const lower = weight.toLowerCase().trim();
    if (map[lower] !== undefined) {
        return map[lower];
    }
    const num = parseInt(weight, 10);
    if (!isNaN(num)) {
        return num;
    }
    return 400; // default
}
// ─── Pixel value parsing ──────────────────────────────────────────────
/**
 * Parses a CSS pixel value string (e.g., "16px", "1.5rem") to a number.
 * Only handles px values accurately; returns 0 for others.
 */
function parsePixelValue(value) {
    if (!value || value === 'auto' || value === 'none' || value === 'normal') {
        return 0;
    }
    const pxMatch = value.match(/^([-\d.]+)px$/);
    if (pxMatch) {
        return parseFloat(pxMatch[1]);
    }
    // Try to parse as a plain number
    const num = parseFloat(value);
    if (!isNaN(num)) {
        return num;
    }
    return 0;
}
// ─── Line height parsing ─────────────────────────────────────────────
/**
 * Parses CSS line-height to a pixel value.
 * line-height can be: normal, a number (multiplier), px, em, %, etc.
 */
function parseLineHeight(lineHeight, fontSize) {
    if (!lineHeight || lineHeight === 'normal') {
        return null; // let Figma use auto
    }
    const pxMatch = lineHeight.match(/^([\d.]+)px$/);
    if (pxMatch) {
        return parseFloat(pxMatch[1]);
    }
    // Pure number = multiplier
    const num = parseFloat(lineHeight);
    if (!isNaN(num) && !lineHeight.includes('%') && !lineHeight.includes('em')) {
        return num * fontSize;
    }
    // Percentage
    if (lineHeight.endsWith('%')) {
        return (parseFloat(lineHeight) / 100) * fontSize;
    }
    // em
    if (lineHeight.endsWith('em')) {
        return parseFloat(lineHeight) * fontSize;
    }
    return null;
}
// ─── Letter spacing parsing ──────────────────────────────────────────
/**
 * Parses CSS letter-spacing to a pixel value.
 */
function parseLetterSpacing(spacing) {
    if (!spacing || spacing === 'normal')
        return 0;
    return parsePixelValue(spacing);
}
// ─── Utility functions ────────────────────────────────────────────────
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
/**
 * Splits a string by commas, but ignores commas inside parentheses.
 */
function splitByTopLevelComma(str) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of str) {
        if (char === '(') {
            depth++;
            current += char;
        }
        else if (char === ')') {
            depth--;
            current += char;
        }
        else if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim()) {
        parts.push(current);
    }
    return parts;
}
//# sourceMappingURL=style-extractor.js.map