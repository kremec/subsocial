import { z } from "zod";

// Hermes only guarantees ISO date parsing, not X's "Tue Nov 14 ... 2023" format.
export const createdAtSchema = z.string().transform((value) => {
  const parts = value.match(
    /^\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (\d{4})$/,
  );
  if (!parts) return undefined;
  const month =
    "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(parts[1]) / 3 + 1;
  if (!Number.isInteger(month)) return undefined;
  return (
    Date.parse(
      `${parts[6]}-${String(month).padStart(2, "0")}-${parts[2]}T${parts[3]}${parts[4]}:${parts[5]}`,
    ) || undefined
  );
});
