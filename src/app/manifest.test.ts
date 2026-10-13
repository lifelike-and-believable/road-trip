import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const publicFile = (src: string) => join(process.cwd(), "public", src);

describe("the web app manifest", () => {
  const m = manifest();

  it("makes the app installable as a standalone app that opens on the home page", () => {
    expect(m.name).toBe("Road Trip");
    expect(m.short_name).toBe("Road Trip");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("en-CA");
  });

  it("uses the board's page colour and panel colour", () => {
    expect(m.background_color).toBe("#E7E8E4");
    expect(m.theme_color).toBe("#22302A");
  });

  it("has 192 and 512 pixel icons that exist, and a 512 one that is also maskable", () => {
    const icons = m.icons ?? [];
    for (const size of ["192x192", "512x512"]) {
      expect(icons.some((i) => i.sizes === size && i.type === "image/png" && i.purpose === "any")).toBe(true);
    }
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const i of icons) expect(existsSync(publicFile(i.src))).toBe(true);
  });
});
