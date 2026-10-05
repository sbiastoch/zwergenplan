/**
 * Deutsche Kartenbeschriftung (Plan 0008, E16). Die OpenFreeMap-Stile beschriften mit
 * `coalesce(name_en, name)`, daher „Nuremberg“. MapLibres `locale` übersetzt nur Bedienelemente; die Sprache
 * der Beschriftung legt allein das `text-field` des Stils fest. MapView.tsx ersetzt es nach jedem `style.load`.
 * Rein: kein Zugriff auf maplibre-gl, die Eingabe bleibt unverändert.
 */

/** Felder der OpenMapTiles-Kacheln mit englischem bzw. lateinischem Namen */
const FOREIGN_NAME_FIELDS = new Set(["name_en", "name:latin", "name_int"]);

/** Deutscher Name, sonst der lokale. Ohne deutsche Felder bleibt `name`, nie eine leere Beschriftung. */
const GERMAN_NAME = ["coalesce", ["get", "name:de"], ["get", "name_de"], ["get", "name"]];

const TOKEN = /^\{([^{}]+)\}$/;

/**
 * Ersetzt in einem `text-field` jedes `["get", <fremder Name>]` und eine Token-Zeichenkette aus genau einem
 * solchen Token (`"{name_en}"`) durch den deutschen Namen. Gibt bei unverändertem Wert dieselbe Referenz zurück.
 */
export function germanTextField(value: unknown): unknown {
  if (typeof value === "string") {
    const field = TOKEN.exec(value)?.[1];
    return field !== undefined && FOREIGN_NAME_FIELDS.has(field) ? structuredClone(GERMAN_NAME) : value;
  }
  if (!Array.isArray(value)) return value;
  const [operator, field] = value;
  if (value.length === 2 && operator === "get" && typeof field === "string" && FOREIGN_NAME_FIELDS.has(field)) {
    return structuredClone(GERMAN_NAME);
  }
  // Nur Ausdrücke durchlaufen; Zeichenketten darin sind Literale (z. B. "\n"), keine Tokens.
  let changed = false;
  const next = value.map((item: unknown) => {
    if (!Array.isArray(item)) return item;
    const replaced = germanTextField(item);
    if (replaced !== item) changed = true;
    return replaced;
  });
  return changed ? next : value;
}
