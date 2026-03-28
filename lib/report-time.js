export const REPORT_TIME_ZONE = "Europe/Paris";

export function getTimeZoneParts(date, timeZone = REPORT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

export function shiftDateParts(parts, deltaDays) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function getTimeZoneOffsetMs(date, timeZone = REPORT_TIME_ZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedMidnightToUtcMs(parts, timeZone = REPORT_TIME_ZONE) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcMs = utcGuess - offset;
  const refinedOffset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (refinedOffset !== offset) {
    utcMs = utcGuess - refinedOffset;
  }
  return utcMs;
}

export function formatDisplayDate(parts) {
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

export function formatIsoDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseIsoDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}
