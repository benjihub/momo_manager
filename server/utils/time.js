const KAMPALA_OFFSET_MIN = 180; // UTC+3, no DST

export function toKampalaDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getTime() + KAMPALA_OFFSET_MIN * 60 * 1000);
}

export function fromKampalaToUtc(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(date.getTime() - KAMPALA_OFFSET_MIN * 60 * 1000);
}

export function startOfDayKampala(dateLike) {
  const kd = toKampalaDate(dateLike);
  kd.setHours(0, 0, 0, 0);
  return fromKampalaToUtc(kd);
}

export function endOfDayKampala(dateLike) {
  const kd = toKampalaDate(dateLike);
  kd.setHours(23, 59, 59, 999);
  return fromKampalaToUtc(kd);
}

export function formatDailyBucket(dateLike) {
  const kd = toKampalaDate(dateLike);
  const y = kd.getFullYear();
  const m = String(kd.getMonth() + 1).padStart(2, '0');
  const d = String(kd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMonthlyBucket(dateLike) {
  const kd = toKampalaDate(dateLike);
  const y = kd.getFullYear();
  const m = String(kd.getMonth() + 1).padStart(2, '0');
  return `${y}_${m}`;
}

export function getISOWeek(dateLike) {
  const d = new Date(toKampalaDate(dateLike));
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function formatWeeklyBucket(dateLike) {
  const d = toKampalaDate(dateLike);
  const y = d.getFullYear();
  const w = String(getISOWeek(d)).padStart(2, '0');
  return `${y}_${w}`;
}

export function isAlignedFullDays(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return startOfDayKampala(from).getTime() === new Date(fromIso).getTime() &&
         endOfDayKampala(to).getTime() === new Date(toIso).getTime();
}

