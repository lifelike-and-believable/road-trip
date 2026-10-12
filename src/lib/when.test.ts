import { describe, expect, it } from "vitest";
import { withOffset } from "./when";

describe("withOffset", () => {
  it("adds the offset the form's clock was on, so the server is never left to guess", () => {
    expect(withOffset("2026-10-17T08:30", () => -240)).toBe("2026-10-17T08:30:00-04:00");
    expect(withOffset("2026-12-17T08:30", () => -300)).toBe("2026-12-17T08:30:00-05:00");
    expect(withOffset("2026-10-17T08:30", () => 330)).toBe("2026-10-17T08:30:00+05:30");
    expect(withOffset("2026-10-17T08:30", () => 0)).toBe("2026-10-17T08:30:00+00:00");
  });

  it("means the same instant as the browser's own reading of that time", () => {
    const [y, mo, d, h, mi] = [2026, 10, 17, 8, 30];
    const local = new Date(y, mo - 1, d, h, mi).getTime();
    expect(Date.parse(withOffset("2026-10-17T08:30")!)).toBe(local);
  });

  it("is null for anything that is not a form's date and time", () => {
    for (const bad of ["", "2026-10-17", "2026-10-17T08:30:00", "2026-13-40T08:30", "soon"]) {
      expect(withOffset(bad)).toBeNull();
    }
  });
});
