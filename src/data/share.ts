/**
 * Teilen per Link (Plan 0026, E6; ADR 0020, Punkt 7): einziger Ort für `navigator.share` und
 * `navigator.clipboard`, mit injizierbarer API für den Unit-Test (Muster: geolocation.ts). Kein `await` vor `share`:
 * Safari verlangt die Nutzer-Aktivierung des Tipps, deshalb liegt das Modul im Start-Bundle.
 */
import { assetUrl } from "./site.ts";

/** „abgebrochen“: kein Toast (das System hat schon Rückmeldung gegeben); „fehler“: Link zum Markieren zeigen */
export type ShareOutcome = "geteilt" | "kopiert" | "abgebrochen" | "fehler";

export interface ShareApi {
  share: ((data: ShareData) => Promise<void>) | undefined;
  writeText: ((text: string) => Promise<void>) | undefined;
}

function browserShareApi(): ShareApi {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: nav?.share ? (data) => nav.share(data) : undefined,
    writeText: nav?.clipboard?.writeText ? (text) => nav.clipboard.writeText(text) : undefined,
  };
}

/** absolute URL zu einem Pfad relativ zur Basis; im E2E-Build zeigt sie auf den Testserver */
export function absoluteUrl(path: string, origin = window.location.origin): string {
  return `${origin}${assetUrl(path)}`;
}

const errorName = (error: unknown) =>
  typeof error === "object" && error !== null && "name" in error ? error.name : undefined;

/**
 * System-Teilen mit Titel und URL, **ohne Text** (WhatsApp setzte sonst Text und URL doppelt; die Vorschaukarte trägt
 * den Inhalt). Abbruch und ein schon offenes Teilen-Menü (`InvalidStateError`, Doppeltipp) bleiben still; verweigert
 * (`NotAllowedError`, `TypeError`) oder ohne Teilen wird kopiert.
 */
export async function shareLink(
  data: { title: string; url: string },
  api: ShareApi = browserShareApi(),
): Promise<ShareOutcome> {
  if (api.share) {
    try {
      await api.share({ title: data.title, url: data.url });
      return "geteilt";
    } catch (error) {
      const name = errorName(error);
      if (name === "AbortError" || name === "InvalidStateError") return "abgebrochen";
    }
  }
  if (!api.writeText) return "fehler";
  try {
    await api.writeText(data.url);
    return "kopiert";
  } catch {
    return "fehler";
  }
}
