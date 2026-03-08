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
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    styles?: Record<string, string>;
    attributes?: Record<string, string>;
    textContent?: string;
    svgString?: string;
    pseudoBefore?: {
        content: string;
        styles: Record<string, string>;
    } | null;
    pseudoAfter?: {
        content: string;
        styles: Record<string, string>;
    } | null;
    children?: RawDomNode[];
}
/**
 * The list of CSS properties we extract via getComputedStyle.
 * Kept as a constant so both the walker and tests can reference it.
 */
export declare const EXTRACTED_STYLE_PROPERTIES: string[];
/**
 * Returns the function body string to be executed inside page.evaluate().
 * It walks the DOM starting from document.body and returns a RawDomNode tree.
 */
export declare function getDomWalkerScript(): string;
//# sourceMappingURL=dom-walker.d.ts.map