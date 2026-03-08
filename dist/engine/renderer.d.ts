/**
 * Puppeteer Rendering Engine
 *
 * Manages a singleton headless Chrome browser instance and provides methods
 * to render URLs or raw HTML, then extract the DOM tree.
 */
import { type RawDomNode } from './dom-walker.js';
export interface Viewport {
    width: number;
    height: number;
}
export declare const VIEWPORT_PRESETS: Record<string, Viewport>;
export type ViewportOption = 'desktop' | 'tablet' | 'mobile' | Viewport;
/**
 * Close the browser instance (for graceful shutdown).
 */
export declare function closeBrowser(): Promise<void>;
export interface RenderResult {
    domTree: RawDomNode;
    url: string;
    viewport: Viewport;
    title: string;
}
/**
 * Render a URL in headless Chrome and extract the DOM tree.
 */
export declare function renderUrl(url: string, viewportOption?: ViewportOption): Promise<RenderResult>;
/**
 * Render raw HTML (with optional CSS) in headless Chrome and extract the DOM tree.
 */
export declare function renderHtml(html: string, css?: string, viewportOption?: ViewportOption): Promise<RenderResult>;
//# sourceMappingURL=renderer.d.ts.map