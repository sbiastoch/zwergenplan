# ADR 0014 – Wochen-Nachricht per Web Push (Declarative Web Push, Zuschnitt auf dem Gerät)

Status: Entwurf (2026-10-05, überarbeitet 2026-10-06 für Plan 0017). Wird mit Plan 0017, Schritt 7, angenommen.
- Baut auf ADR 0013 auf und ergänzt ADR 0002 (Hosting).
- **Ändert** ADR 0013, Punkt 5 (`src/data/push.ts` liest die Registrierung selbst, Punkt 6 unten), und ADR 0011, Punkt 6 (neuer Anlass „beim Push“ für `wegzeit.json`, für alle gleich, Punkt 4 unten).
- **Ergänzt** ADR 0017, Punkt 1 und 3: Der gespeicherte Startpunkt liegt bei eingeschaltetem Push zusätzlich im Geräte-Speicher (IndexedDB) und verlässt das Gerät weiterhin nie.
- Ändert die Invarianten „Privatsphäre“, „Startpunkt“ und „Kein Request hängt davon ab, welcher Startpunkt gilt“ in `docs/architecture.md`.
- Details stehen in Plan 0017 (ersetzt Stufe 2 von Plan 0011) und für Übernommenes in Plan 0011 (E8, E10–E12).

## Kontext

- Neue Angebote kommen mit jedem Pipeline-Lauf. Wer die Seite nicht öffnet, erfährt nichts davon.
- Eine Nachricht nach jedem Lauf hätte wenig Wert: Sie hinge nicht an dem, was die Familie sucht (Nutzer, 2026-10-06). Eine Filterung beim Absender ginge nur, wenn der Absender die Filter kennt.
- Familie und Freunde nutzen überwiegend iPhones. Dort gibt es keinen Periodic Background Sync, Hintergrund-Updates gehen nur über Web Push.
- Seit iOS/iPadOS 18.4 und macOS 15.5 unterstützt Safari **Declarative Web Push** (inzwischen in der Push-API-Spec):
  - Die Payload enthält die fertige Nachricht (`"web_push": 8030`), die das System ohne Service Worker anzeigt.
  - Mit `"mutable": true` darf ein Service Worker sie über `PushEvent.notification` ersetzen.
  - Browser ohne Unterstützung liefern dieselbe Payload als klassisches `push`-Event.
- Auf dem Gerät lässt sich eine Nachricht nicht unterdrücken: Safari entzieht die Berechtigung nach stillen Pushes, Chrome verlangt bei jedem Push eine sichtbare Nachricht.
- Für Push braucht es zwei Dinge, die GitHub Pages nicht bietet: einen Ort für die Abos und einen Absender mit privatem VAPID-Schlüssel.

## Entscheidung

1. **Eine Nachricht pro Woche, immer**: samstags gegen 10 Uhr Berliner Zeit, auch wenn es nichts Neues gibt (Nutzerentscheidung 2026-10-06). Sie wird **auf dem Gerät** zugeschnitten.
   - Ein Payload-Format für alle Browser: Declarative Web Push mit `mutable: true`. Der Absender schickt nur einen allgemeinen Text mit Zahlen aus den öffentlichen Daten (neu seit letztem Samstag, Angebote der nächsten 7 Tage) und den Versandzeitpunkt, ohne Bezug zu Personen.
   - Der Service Worker ersetzt ihn durch einen Text nach den **Such-Abos** (gemerkte Filter der Liste, ODER), dem **Alter** des Kindes und der Wegzeit ab dem **gespeicherten Startpunkt**. Auf Chromium und Firefox zeigt er ihn selbst an. Ein Tipp öffnet immer die Startseite.
2. **Abos in einem Cloudflare Worker mit Workers KV** (`push-worker/` im Repo, Gratis-Tarif).
   - Er speichert nur das `PushSubscription`-JSON und das Datum der Anmeldung, dazu je Samstag eine Versand-Marke (höchstens ein Versand je Tag).
   - Öffentlich sind nur An- und Abmelden. Die Grenzen sind Allowlist der Push-Dienste, Größen- und Mengengrenze und ein Rate-Limit je IP (gehasht, eine Stunde). Die Origin-Prüfung (403) hält nur fremde Webseiten ab.
   - `GET /version` zeigt den deployten Commit, weil der Worker manuell deployt wird.
   - Lesen, Aufräumen und die Versand-Marke nur mit Token.
3. **Gesendet wird aus GitHub Actions nach Zeitplan** (`.github/workflows/push-weekly.yml`, `cron` mit `timezone: Europe/Berlin`, Minute 7). Ein Wächter sendet nur samstags zwischen 10 und 14 Uhr Berliner Zeit; die Versand-Marke im Worker verhindert einen zweiten Versand am selben Tag. Gesendet wird mit `web-push` (devDependency) und dem VAPID-Schlüssel als GitHub-Secret. Der Lauf ist kein Gate; eine fehlgeschlagene Zustellung ist eine Warnung, und verwirft GitHub einen Lauf, fällt die Woche aus.
4. **Privatsphäre, Änderungen an den Invarianten:**
   - Bei eingeschaltetem Push liegen **zusätzlich** im IndexedDB des eigenen Origins: Geburtsdatum, Such-Abos, der gespeicherte Startpunkt (die Stadtteil-ID oder der schon gerundete Punkt, genau wie im `localStorage`, ADR 0017), die bei der letzten Nachricht bekannten Angebots-IDs und der Endpoint des eigenen Abos. Beim Abschalten werden sie gelöscht. Sie stehen weiterhin nie in URL, Logs oder Requests. Gespiegelt wird, solange das Kind-Sheet offen ist.
   - Neue Requests nur nach ausdrücklichem Tipp auf den Schalter „Wochen-Nachricht“:
     - an den Push-Dienst des Browser-Herstellers (durch den Browser);
     - an den Worker, nur mit dem Abo.
   - Einzige Ausnahme ohne Tipp, bei schon eingeschaltetem Push: Tauscht der Browser das Abo aus (`pushsubscriptionchange`, Abgleich beim Öffnen des Kind-Sheets), meldet das Gerät das neue Abo an und das alte ab. Auch das enthält nur das Abo.

     Der Worker sieht IP-Adresse und Zeitpunkt der Anmeldung, aber nichts über das Kind, die Such-Abos, den Startpunkt oder die Merkliste.
   - **Neuer Anlass „beim Push“** (ändert ADR 0011, Punkt 6): Der Service Worker lädt bei **jedem** Push genau einmal `data/site.json` und `data/wegzeit.json` (bedingt, `no-cache`), egal ob ein Startpunkt, ein Abo oder ein Abo mit Wegzeit gespeichert ist. URL und Inhalt sind für alle gleich; die Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ gilt damit in der Sache unverändert.
   - Das Ziel eines Tipps ist immer die Startseite. Ein Ziel je Treffer (etwa `?angebot=…`) hinge über ein Abo mit Wegzeit vom Startpunkt ab und ginge per Navigation Preload ans Netz.
5. **Wegzeit-Logik im Service Worker:** `src/domain/transit.ts` ist für die App nur per `import()` erlaubt, um das Start-JS klein zu halten (Plan 0009, E10). Der Service Worker ist ein klassisches Skript mit eigenem Bundle und Budget und berührt das Start-JS nicht. Deshalb nehmen `transit-only-lazy` und `transit-entry-only` `^src/sw/` aus; ein Kanarienvogel hält die Regel für `src/ui/` rot.
6. **`src/data/push.ts` liest die Registrierung selbst** (ändert ADR 0013, Punkt 5): `navigator.serviceWorker.getRegistration()` und, nach der Erlaubnis im Tipp, `ready`, nur lesend für `pushManager`. Registrieren, aktualisieren und auf Nachrichten hören bleibt allein `src/data/pwa.ts`. Eine Injektion über den Lader kostete Start-JS, das Budget hat dafür keinen Platz (Plan 0017, E9).

## Alternativen

- **Nachricht nach jedem Deploy** (bisheriger Entwurf, Plan 0011 Stufe 2): Ein Lauf ohne passende Angebote schickt trotzdem eine Nachricht, und unterdrücken lässt sie sich auf dem Gerät nicht. Ersetzt durch den festen Wochentermin.
- **Filterung beim Absender** (Such-Abos, Startpunkt-Stadtteil und Geburtsmonat mit dem Abo speichern, nur bei Treffern senden): die bessere Nachricht, aber Daten über Familie und Wohngegend verlassen das Gerät. Spätere Stufe mit eigenem Plan und ADR (`docs/ideas.md`).
- **Periodic Background Sync statt Push:** kein Server nötig, aber nur Chromium, nur installiert, Takt vom Browser bestimmt. Auf dem iPhone geht es nicht.
- **Nur klassisches Web Push:** Jeder Push muss im Service Worker eine Nachricht anzeigen. Safari entzieht die Berechtigung nach stillen Pushes, ein Fehler im Zuschnitt würde also Abos kosten. Declarative Push zeigt immer den Ersatztext.
- **Senden im Worker statt in CI** (Cron-Trigger): ein Ort weniger, aber Abos und privater Schlüssel lägen zusammen im Netz, und die RFC-8291-Verschlüsselung müsste selbst gebaut oder `web-push` unter `nodejs_compat` betrieben werden.
- **Andere Abo-Speicher:**
  - Deno Deploy mit KV, Supabase oder Val Town: gleichwertig, aber weniger verbreitet bzw. mehr als nötig.
  - Ein GitHub-Issue oder ein Gist als Speicher wäre öffentlich bzw. bräuchte ein Token im Client.
  - Abos händisch per Messenger einzusammeln wäre für Familie und Freunde zu umständlich.

## Konsequenzen

- Erstmals gibt es Infrastruktur außerhalb von GitHub Pages: ein Cloudflare-Konto, ein KV-Namespace und zwei Secrets (`VAPID_PRIVATE_KEY`, `PUSH_ADMIN_TOKEN`). Ein Ausfall des Workers betrifft nur An- und Abmelden und den Versand, nie die Seite.
- iPhones bekommen Push nur als installierte Home-Bildschirm-App (im Spike von Plan 0011 bestätigt). Die Installationshilfe aus ADR 0013 ist deshalb Voraussetzung.
- „Keine Strafe für stille Pushes“ gilt nur, solange der Service Worker rechtzeitig fertig wird. Überzieht er das Zeitbudget von iOS (≈ 10 s), erscheint keine Nachricht, und die nächsten kommen verspätet (Spike). Der Zuschnitt hat deshalb ein hartes Limit von 5 s.
- GitHub-Zeitpläne starten verspätet, verwerfen unter Last Läufe und werden nach 60 Tagen ohne Commit abgeschaltet. Die README nennt das Wiedereinschalten.
- Ein Startpunkt, der außerhalb des Kind-Sheets gewählt wird, wirkt in der Nachricht erst nach dem nächsten Öffnen des Kind-Sheets (kein Haken im Start-Bundle).
- Neue Gates für `push-worker/` (Typen, Unit-Tests, dependency-cruiser, knip) und die Fixture-Option `pushWorker: "mock"` im E2E-Drittanbieter-Wächter.
- Weitere Push-Anlässe (Anmeldung öffnet, Merkliste) brauchen einen eigenen Plan, gegebenenfalls ein eigenes ADR.
