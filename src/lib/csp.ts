/* The content security policy every page is sent with. Next's own inline scripts need
   'unsafe-inline': a nonce would make every page dynamic, which Partial Prerendering cannot
   do. The policy still keeps scripts, fonts and requests on this site, so injected markup
   cannot load code or send data elsewhere, and lets in only the map's tiles from
   OpenStreetMap. Leaflet positions the map with inline styles. Vercel adds its toolbar,
   for preview comments, to preview deployments, so those also let in the hosts it uses. */

// The hosts Vercel's documentation lists for the toolbar.
const TOOLBAR = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  img: ["https://vercel.live", "https://vercel.com"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
  frame: ["https://vercel.live"],
};

export function contentSecurityPolicy({ dev, preview }: { dev: boolean; preview: boolean }): string {
  const extra = (hosts: string[]) => (preview ? hosts.map((h) => ` ${h}`).join("") : "");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${extra(TOOLBAR.script)}`,
    `style-src 'self' 'unsafe-inline'${extra(TOOLBAR.style)}`,
    `img-src 'self' data: blob: https://tile.openstreetmap.org${extra(TOOLBAR.img)}`,
    `font-src 'self'${extra(TOOLBAR.font)}`,
    `connect-src 'self'${extra(TOOLBAR.connect)}`,
    ...(preview ? [`frame-src${extra(TOOLBAR.frame)}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
