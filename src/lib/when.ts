/* The trip form's date and time fields give a clock reading with no offset. The server
   will not guess which clock it was, so the form adds the offset its own clock was on
   at that moment before sending. */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const browserOffset = (d: Date) => -d.getTimezoneOffset();

/** "2026-10-17T08:30" from a datetime-local field to "2026-10-17T08:30:00-04:00". Null if it is not one. */
export function withOffset(local: string, offsetMinutes: (d: Date) => number = browserOffset): string | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== h) return null;
  const off = offsetMinutes(date);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${local}:00${sign}${hh}:${mm}`;
}
