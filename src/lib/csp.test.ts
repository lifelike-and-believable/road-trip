import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("contentSecurityPolicy", () => {
  it("keeps scripts and requests on this site in production, and lets in only the map's tiles", () => {
    const csp = contentSecurityPolicy({ dev: false, preview: false });
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https://tile.openstreetmap.org");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(csp).not.toContain("vercel");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  // Vercel adds its toolbar, for preview comments, to preview deployments only.
  it("lets in the Vercel toolbar's hosts on a preview deployment", () => {
    const csp = contentSecurityPolicy({ dev: false, preview: true });
    expect(directive(csp, "script-src")).toContain("https://vercel.live");
    expect(directive(csp, "connect-src")).toContain("https://vercel.live");
    expect(directive(csp, "connect-src")).toContain("wss://ws-us3.pusher.com");
    expect(directive(csp, "frame-src")).toContain("https://vercel.live");
    expect(directive(csp, "font-src")).toContain("https://assets.vercel.com");
    expect(directive(csp, "img-src")).toContain("https://vercel.com");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("allows eval and plain http only in development, where Next needs them", () => {
    const csp = contentSecurityPolicy({ dev: true, preview: false });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
