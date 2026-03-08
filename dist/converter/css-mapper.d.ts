/**
 * CSS-to-Figma Property Mapping Utilities
 *
 * Converts CSS properties extracted from computed styles into
 * Figma-compatible property values.
 */
import { type RGBAColor, type ParsedTransform } from '../engine/style-extractor.js';
export interface FigmaFill {
    type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'IMAGE';
    color?: RGBAColor;
    opacity?: number;
    gradientStops?: Array<{
        position: number;
        color: RGBAColor;
    }>;
    gradientTransform?: number[][];
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
    offset?: {
        x: number;
        y: number;
    };
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
/**
 * Converts CSS flex properties to Figma auto-layout configuration.
 */
export declare function mapFlexToAutoLayout(styles: Record<string, string>): FigmaAutoLayout | null;
/**
 * Best-effort conversion of CSS grid to Figma auto-layout.
 * CSS Grid doesn't map cleanly to Figma auto-layout, so we approximate.
 */
export declare function mapGridToAutoLayout(styles: Record<string, string>): FigmaAutoLayout | null;
/**
 * Converts CSS background properties to Figma fills array.
 */
export declare function mapBackground(bgColor: string, bgImage: string, bgSize?: string): FigmaFill[];
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
export declare function mapBorder(styles: Record<string, string>): FigmaBorderResult | null;
/**
 * Converts CSS box-shadow to Figma effects array.
 */
export declare function mapShadow(boxShadow: string): FigmaEffect[];
export interface FigmaFontInfo {
    fontFamily: string;
    fontWeight: number;
    fontStyle: string;
}
/**
 * Maps CSS font properties to Figma-compatible font information.
 * Cleans up font-family strings and resolves weight/style.
 */
export declare function mapFont(fontFamily: string, fontWeight: string, fontStyle: string): FigmaFontInfo;
export interface FigmaCornerRadius {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
}
/**
 * Extracts individual corner radii from CSS border-radius properties.
 */
export declare function mapBorderRadius(styles: Record<string, string>): FigmaCornerRadius;
/**
 * Extracts rotation from CSS transform for Figma.
 */
export declare function mapTransform(transformStr: string): ParsedTransform;
/**
 * Determines Figma layout sizing based on CSS width/flex properties.
 */
export declare function mapLayoutSizing(styles: Record<string, string>, parentStyles?: Record<string, string>): {
    horizontal: 'FIXED' | 'HUG' | 'FILL';
    vertical: 'FIXED' | 'HUG' | 'FILL';
};
//# sourceMappingURL=css-mapper.d.ts.map