// A passport's two machine-readable lines (ICAO 9303, TD3: 2 lines of 44 characters), read by code. The model only copies the
// printed lines; this checks every check digit (document number, birth date, expiry, personal number, and the whole), and a
// line that fails any is NOT trusted: the number, birth date, expiry and nationality stay empty and staff type them.

const WEIGHTS = [7, 3, 1];
const A = "A".charCodeAt(0);

const valueOf = (char: string): number | null => {
  if (char === "<") return 0;
  if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48;
  if (char >= "A" && char <= "Z") return char.charCodeAt(0) - A + 10;
  return null;
};

/** The check digit of a field, or null when it holds a character an MRZ cannot. */
export function checkDigitOf(field: string): number | null {
  let sum = 0;
  for (let index = 0; index < field.length; index += 1) {
    const value = valueOf(field[index] ?? "");
    if (value === null) return null;
    sum += value * (WEIGHTS[index % 3] ?? 1);
  }
  return sum % 10;
}

const holds = (field: string, digit: string): boolean => {
  const expected = checkDigitOf(field);
  return expected !== null && digit === String(expected);
};

export interface Mrz {
  /** Surname and given names, from line 1 (the data page says them better; this is the fallback). */
  surname: string;
  givenNames: string;
  number: string;
  /** Three-letter country code as printed ("IND"). */
  nationality: string;
  /** yyyy-mm-dd; the century of a two-digit birth year is the latest one that is not in the future. */
  dateOfBirth: string;
  sex: "male" | "female" | null;
  expiresOn: string;
}

/** Characters an OCR-ish copy commonly gets wrong are NOT repaired: a copy that fails its digits is refused. */
const clean = (line: string): string => line.replace(/\s+/g, "").toUpperCase();

function dayOf(yymmdd: string, kind: "birth" | "expiry", today: string): string | null {
  const [yy, mm, dd] = [Number(yymmdd.slice(0, 2)), Number(yymmdd.slice(2, 4)), Number(yymmdd.slice(4, 6))];
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const thisYear = Number(today.slice(0, 4));
  // A birth year is the latest century not in the future; a passport's expiry is always this century.
  const year = kind === "expiry" ? 2000 + yy : yy + (2000 + yy > thisYear ? 1900 : 2000);
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return `${String(year)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** The passport's data when both lines are well formed and every check digit holds; null otherwise. `today` is yyyy-mm-dd. */
export function readMrz(line1: string, line2: string, today: string): Mrz | null {
  const [one, two] = [clean(line1), clean(line2)];
  if (one.length !== 44 || two.length !== 44 || !one.startsWith("P")) return null;
  const number = two.slice(0, 9);
  const birth = two.slice(13, 19);
  const expiry = two.slice(21, 27);
  const personal = two.slice(28, 42);
  const composite = two.slice(0, 10) + two.slice(13, 20) + two.slice(21, 43);
  const fine =
    holds(number, two[9] ?? "") &&
    holds(birth, two[19] ?? "") &&
    holds(expiry, two[27] ?? "") &&
    // The personal number may be blank (all "<"), in which case its digit is "<" or "0".
    (/^<*$/.test(personal) ? two[42] === "<" || two[42] === "0" : holds(personal, two[42] ?? "")) &&
    holds(composite, two[43] ?? "");
  if (!fine) return null;
  const dateOfBirth = dayOf(birth, "birth", today);
  const expiresOn = dayOf(expiry, "expiry", today);
  if (dateOfBirth === null || expiresOn === null) return null;
  const [surname = "", given = ""] = one.slice(5).split("<<");
  const sex = two[20] === "M" ? "male" : two[20] === "F" ? "female" : null;
  return {
    surname: surname.replaceAll("<", " ").trim(),
    givenNames: given.replaceAll("<", " ").trim(),
    number: number.replaceAll("<", ""),
    nationality: two.slice(10, 13).replaceAll("<", ""),
    dateOfBirth,
    sex,
    expiresOn,
  };
}
