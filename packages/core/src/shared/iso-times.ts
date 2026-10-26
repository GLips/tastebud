/** Record and listener timestamps: local ISO 8601 with an explicit offset. Pure string work. */
const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** Local time, ISO 8601 with milliseconds and an explicit offset (never a bare `Z`). */
export const formatLocalIsoTime = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
};

/** Orders ISO times across offsets; string comparison would not. */
export const compareIsoTimes = (left: string, right: string): number => Date.parse(left) - Date.parse(right);
