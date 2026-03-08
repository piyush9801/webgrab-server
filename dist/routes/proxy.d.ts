/**
 * Proxy Route - GET /api/proxy-asset
 *
 * Proxies asset requests (images, fonts, etc.) to avoid CORS issues
 * when the Figma plugin fetches resources from external origins.
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=proxy.d.ts.map