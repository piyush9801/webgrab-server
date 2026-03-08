/**
 * Asset Resolver - Handles resolution and proxying of images and fonts.
 */
/**
 * Resolves a potentially relative image URL to an absolute URL.
 */
export declare function resolveImageUrl(src: string, baseUrl: string): string;
/**
 * Extracts the best image URL from various attributes.
 * Priority: currentSrc/src > data-src > srcset > source-srcsets > data-lazy-src
 */
export declare function extractBestImageUrl(attributes: Record<string, string>): string;
/**
 * Creates a proxy URL through our server to avoid CORS issues.
 */
export declare function proxyAssetUrl(originalUrl: string, serverBase: string): string;
/**
 * Replaces all image URLs in a DOM tree with proxied versions.
 * Modifies the tree in place.
 */
export declare function proxyAllAssets(node: any, baseUrl: string, serverBase: string): void;
/**
 * Resolves a CSS font-family to the best available Figma font.
 */
export declare function resolveFont(fontFamily: string): string;
//# sourceMappingURL=asset-resolver.d.ts.map