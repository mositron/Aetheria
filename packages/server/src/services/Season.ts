// Date-driven seasonal event detector. Pure function — easy to unit test
// by injecting a Date.

export type Season =
  | "none"
  | "songkran"
  | "halloween"
  | "christmas"
  | "loy_krathong";

export function getCurrentSeason(now: Date = new Date()): Season {
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  if (month === 3 && day >= 13 && day <= 15) return "songkran";       // Apr 13-15
  if (month === 10 && day >= 20 && day <= 25) return "loy_krathong";  // Nov 20-25
  if (month === 9 && day === 31) return "halloween";                  // Oct 31
  if (month === 11 && day >= 24 && day <= 26) return "christmas";     // Dec 24-26
  return "none";
}
