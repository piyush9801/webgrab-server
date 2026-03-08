/**
 * Style Extractor - Parses raw CSS computed style strings into structured objects
 * suitable for conversion to Figma properties.
 */
export interface RGBAColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
export interface ParsedShadow {
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    color: RGBAColor;
    inset: boolean;
}
export interface GradientStop {
    position: number;
    color: RGBAColor;
}
export interface ParsedGradient {
    type: 'linear' | 'radial' | 'conic';
    angle: number;
    stops: GradientStop[];
}
export interface ParsedBorder {
    width: number;
    style: string;
    color: RGBAColor;
}
export interface ParsedTransform {
    rotation: number;
    scaleX: number;
    scaleY: number;
    translateX: number;
    translateY: number;
}
/**
 * Parses a CSS color string (rgb, rgba, hex, named) into an RGBAColor object.
 * Returns null for transparent/invalid colors.
 */
export declare function parseColor(colorStr: string): RGBAColor | null;
/**
 * Checks if a color is effectively transparent.
 */
export declare function isTransparent(color: RGBAColor | null): boolean;
/**
 * Parses a CSS box-shadow string into an array of ParsedShadow objects.
 * Handles multiple shadows separated by commas.
 */
export declare function parseBoxShadow(shadowStr: string): ParsedShadow[];
/**
 * Parses a CSS gradient string (linear-gradient, radial-gradient) into a
 * ParsedGradient object.
 */
export declare function parseGradient(gradientStr: string): ParsedGradient | null;
/**
 * Parses individual border properties into a structured ParsedBorder.
 */
export declare function parseBorder(width: string, style: string, color: string): ParsedBorder | null;
/**
 * Parses a CSS transform string to extract rotation, scale, and translate.
 */
export declare function parseTransform(transformStr: string): ParsedTransform;
/**
 * Maps CSS font-weight strings to numeric values.
 */
export declare function parseFontWeight(weight: string): number;
/**
 * Parses a CSS pixel value string (e.g., "16px", "1.5rem") to a number.
 * Only handles px values accurately; returns 0 for others.
 */
export declare function parsePixelValue(value: string): number;
/**
 * Parses CSS line-height to a pixel value.
 * line-height can be: normal, a number (multiplier), px, em, %, etc.
 */
export declare function parseLineHeight(lineHeight: string, fontSize: number): number | null;
/**
 * Parses CSS letter-spacing to a pixel value.
 */
export declare function parseLetterSpacing(spacing: string): number;
/**
 * Splits a string by commas, but ignores commas inside parentheses.
 */
export declare function splitByTopLevelComma(str: string): string[];
//# sourceMappingURL=style-extractor.d.ts.map