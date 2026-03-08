/**
 * DOM-to-Figma Converter
 *
 * Transforms a RawDomNode tree (extracted from Puppeteer) into a
 * Figma-compatible JSON structure that the Figma plugin can directly consume.
 */
import type { RawDomNode } from '../engine/dom-walker.js';
import { type FigmaFill, type FigmaStroke, type FigmaEffect } from './css-mapper.js';
import { type RGBAColor } from '../engine/style-extractor.js';
export interface FigmaNode {
    type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'VECTOR' | 'GROUP';
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
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
    fills?: FigmaFill[];
    strokes?: FigmaStroke[];
    strokeWeight?: number;
    strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
    strokeTopWeight?: number;
    strokeRightWeight?: number;
    strokeBottomWeight?: number;
    strokeLeftWeight?: number;
    effects?: FigmaEffect[];
    cornerRadius?: number | {
        topLeft: number;
        topRight: number;
        bottomLeft: number;
        bottomRight: number;
    };
    opacity?: number;
    clipsContent?: boolean;
    rotation?: number;
    visible?: boolean;
    characters?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    fontStyle?: string;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT';
    lineHeight?: number | {
        unit: 'AUTO';
    };
    letterSpacing?: number;
    textDecoration?: string;
    textCase?: string;
    textColor?: RGBAColor;
    imageUrl?: string;
    svgString?: string;
    children?: FigmaNode[];
}
export interface ConversionOptions {
    baseUrl: string;
    serverBase: string;
    includeInvisible?: boolean;
}
/**
 * Converts a RawDomNode tree to a Figma-compatible node tree.
 */
export declare function convertDomToFigma(domTree: RawDomNode, options: ConversionOptions): FigmaNode;
//# sourceMappingURL=dom-to-figma.d.ts.map