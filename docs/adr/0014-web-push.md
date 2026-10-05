# ADR 0014 – Web Push zu neuen Angeboten (Declarative Web Push)

Status: Entwurf (2026-10-05). Wird mit Stufe 2 von Plan 0011 angenommen (Schritt 11). Baut auf ADR 0013 auf, ergänzt ADR 0002 (Hosting) und ändert die Privatsphäre-Invarianten in `docs/architecture.md`. Details stehen in Plan 0011 (E8–E13).

## Kontext

- Neue Angebote kommen mit jedem Pipeline-Lauf. Wer die Seite nicht öffnet, erfährt nichts davon.
- Familie und Freunde nutzen überwiegend iPhones. Dort gibt es keinen Periodic Background Sync, Hintergrund-Updates gehen nur über Web Push.
- Seit iOS/iPadOS 18.4 und macOS 15.5 unterstützt Safari **Declarative Web Push** (inzwischen in der Push-API-Spec):
  - Die Payload enthält die fertige Nachricht (`"web_push": 8030`), die das System ohne Service Worker anzeigt.
  - Mit `"mutable": true` darf ein Service Worker sie über `PushEvent.notification` ersetzen.
  - Browser ohne Unterstützung liefern dieselbe Payload als klassisches `push`-Event.
- Für Push braucht es zwei Dinge, die GitHub Pages nicht bietet: einen Ort für die Abos und einen Absender mit privatem VAPID-Schlüssel.

## Entscheidung

1. **Ein Payload-Format für alle Browser: Declarative Web Push** mit `mutable: true`.
   - Der Absender schickt nur einen allgemeinen Text mit der Zahl neuer Angebote und dem Versandzeitpunkt, ohne Bezug zu Personen.
   - Der Service Worker schneidet die Nachricht auf dem Gerät auf das Alter des Kindes zu. Auf Chromium und Firefox zeigt er sie selbst an.
2. **Abos in einem Cloudflare Worker mit Workers KV** (`push-worker/` im Repo, Gratis-Tarif).
   - Er speichert nur das `PushSubscription`-JSON und das Datum der Anmeldung.
   - Öffentlich sind nur An- und Abmelden. Die Grenzen sind Allowlist der Push-Dienste, Größen- und Mengengrenze und ein Rate-Limit je IP (gehasht, eine Stunde). Die Origin-Prüfung (403) hält nur fremde Webseiten ab.
   - `GET /version` zeigt den deployten Commit, weil der Worker manuell deployt wird.
   - Lesen und Aufräumen nur mit Token.
3. **Gesendet wird aus der CI**: Job `notify` nach erfolgreichem Deploy, nur bei neuen Angeboten.
   - Er wartet, bis die Live-`meta.json` den neuen Commit zeigt.
   - Er sendet mit `web-push` (devDependency) und dem VAPID-Schlüssel als GitHub-Secret.
   - Der Job ist kein Gate. Der Inhalt ist zu diesem Zeitpunkt schon live, eine fehlgeschlagene Zustellung ist eine Warnung.
4. **Privatsphäre, Änderungen an den Invarianten:**
   - Das Geburtsdatum und die zuletzt gesehenen Angebots-IDs dürfen **zusätzlich** im IndexedDB des eigenen Origins liegen, und nur, solange Push eingeschaltet ist. Beim Abschalten werden sie gelöscht. Sie stehen weiterhin nie in URL, Logs oder Requests.
   - Neue Requests nur nach ausdrücklichem Tipp auf „Benachrichtigen“:
     - an den Push-Dienst des Browser-Herstellers (durch den Browser);
     - an den Worker, nur mit dem Abo.
   - Einzige Ausnahme ohne Tipp, bei schon eingeschaltetem Push: Tauscht der Browser das Abo aus (`pushsubscriptionchange`, Abgleich beim App-Start), meldet das Gerät das neue Abo an und das alte ab. Auch das enthält nur das Abo.

     Der Worker sieht IP-Adresse und Zeitpunkt der Anmeldung, aber nichts über das Kind, den Startpunkt oder die Merkliste.
   - Der Request des Service Workers auf `data/site.json` beim Push ist für alle gleich.
   - Die Invariante „Kein Request hängt davon ab, welcher Startpunkt gilt“ (ADR 0011) bleibt unverändert.

## Alternativen

- **Periodic Background Sync statt Push:** kein Server nötig, aber nur Chromium, nur installiert, Takt vom Browser bestimmt. Auf dem iPhone geht es nicht.
- **Nur klassisches Web Push:** Jeder Push muss im Service Worker eine Nachricht anzeigen. Safari entzieht die Berechtigung nach stillen Pushes, ein Fehler im Zuschnitt würde also Abos kosten. Declarative Push zeigt immer den Ersatztext.
- **Zuschnitt beim Absender** (Alter oder Geburtsmonat mit dem Abo speichern): genauere Nachrichten auch ohne Service Worker, aber Daten über das Kind verlassen das Gerät. Abgelehnt.
- **Senden im Worker statt in CI:** ein Ort weniger, aber Abos und privater Schlüssel lägen zusammen im Netz, und die RFC-8291-Verschlüsselung müsste selbst gebaut oder `web-push` unter `nodejs_compat` betrieben werden.
- **Andere Abo-Speicher:**
  - Deno Deploy mit KV, Supabase oder Val Town: gleichwertig, aber weniger verbreitet bzw. mehr als nötig.
  - Ein GitHub-Issue oder ein Gist als Speicher wäre öffentlich bzw. bräuchte ein Token im Client.
  - Abos händisch per Messenger einzusammeln wäre für Familie und Freunde zu umständlich.

## Konsequenzen

- Erstmals gibt es Infrastruktur außerhalb von GitHub Pages: ein Cloudflare-Konto, ein KV-Namespace und zwei Secrets (`VAPID_PRIVATE_KEY`, `PUSH_ADMIN_TOKEN`). Ein Ausfall des Workers betrifft nur An- und Abmelden und den Versand, nie die Seite.
- iPhones bekommen Push nur als installierte Home-Bildschirm-App (im Spike von Plan 0011 bestätigt). Die Installationshilfe aus ADR 0013 ist deshalb Voraussetzung.
- „Keine Strafe für stille Pushes“ gilt nur, solange der Service Worker rechtzeitig fertig wird. Überzieht er das Zeitbudget von iOS (≈ 10 s), erscheint keine Nachricht, und die nächsten kommen verspätet (Spike). Der Zuschnitt hat deshalb ein hartes Limit von 5 s.
- Neue Gates für `push-worker/` (Typen, Unit-Tests, dependency-cruiser, knip) und die Fixture-Option `pushWorker: "mock"` im E2E-Drittanbieter-Wächter.
- Weitere Push-Anlässe (Anmeldung öffnet, Merkliste) und Zuschnitt nach Wegzeit brauchen einen eigenen Plan, gegebenenfalls ein eigenes ADR.
