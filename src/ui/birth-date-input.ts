/**
 * Eingabe des Geburtsdatums (Plan 0033, E6), aus dem Kind-Sheet herausgezogen, damit das Onboarding dieselbe
 * Speicherung nutzt: Text im Zustand, gültiges Datum sofort speichern, leeres Feld löscht, Blur formatiert.
 */
import { type ChangeEvent, useState } from "react";
import { formatGermanDate, parseGermanDate } from "../domain/time.ts";

export const BIRTH_DATE_INVALID = "Bitte als TT.MM.JJJJ eingeben, z. B. 02.11.2025.";

export function useBirthDateInput(
  birthDate: string | undefined,
  today: string,
  onBirthDate: (iso: string | undefined) => void,
): {
  text: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  /** ISO-Datum, wenn der Text gültig ist */
  parsed: string | undefined;
  /** Text nicht leer und nicht gültig */
  invalid: boolean;
} {
  const [text, setText] = useState(birthDate ? formatGermanDate(birthDate) : "");
  const parsed = parseGermanDate(text, today);
  return {
    text,
    onChange: (e) => {
      const next = e.target.value;
      setText(next);
      const iso = parseGermanDate(next, today);
      if (iso) onBirthDate(iso);
      else if (!next.trim()) onBirthDate(undefined);
    },
    onBlur: () => {
      if (parsed) setText(formatGermanDate(parsed));
    },
    parsed,
    invalid: !parsed && text.trim() !== "",
  };
}
