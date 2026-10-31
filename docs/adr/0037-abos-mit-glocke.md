# ADR 0037 – Abos mit Glocke: Anbieter im Zuschnitt der Wochen-Nachricht, Such-Abos im Start

Status: **angenommen** (2026-10-29, mit Plan 0054). **Teilweise ersetzt durch ADR 0042** (2026-10-31): Punkte 2 und 7, Such-Abos entfallen.
- **Ändert** ADR 0014, Punkt 4: Anbieter-Abos liegen bei eingeschaltetem Push zusätzlich im Geräte-Speicher. Gespiegelt wird auch nach jedem Glocken-Tipp, nicht nur bei offenem Kind-Sheet. Ein Glocken-Tipp bei ausgeschaltetem Push schaltet ihn ein, mit Erlaubnis-Dialog und Anmeldung beim Push-Worker wie der Schalter.
- **Ändert** ADR 0013 (Precache-Liste): Der Chunk `assets/app/AppSection-*` steht in `startChunks`. Damit ändert sich auch ADR 0027, Konsequenzen („Die Precache-Liste … ändert sich nicht“).
- **Ändert** ADR 0027: Der App-Chunk lädt zusätzlich vor, sobald eine Glocke sichtbar ist. Das ist der Tab „Anbieter“, das Anbieter-Sheet oder die Glocke der Suche.
- **Ändert** Plan 0025, E1, und die Invariante „Privatsphäre“ in `docs/architecture.md`: Gemerkte Anbieter heißen jetzt Anbieter-Abos, und der Push liest sie.
- **Ändert** Plan 0017, E7: „Suche abonnieren“ steht an der Liste statt im Kind-Sheet. `src/domain/searches.ts` und `src/data/searches-store.ts` liegen im Start. Die Regeln `push-domain-not-in-start`, `app-data-only-lazy`, `onboarding-apart-from-app` und `pwa-core-no-push` nennen sie nicht mehr.

## Kontext

- Die Familie will vor allem erfahren, wenn ein Anbieter, den sie kennt, etwas Neues und Passendes hat (Nutzer, 2026-10-29). Gemerkte Anbieter (Plan 0025) wirkten bisher nur im Tab „Anbieter“.
- Such-Abos ließen sich nur tief im Kind-Sheet anlegen (Plan 0017, E7), weil das Start-Budget damals keinen Platz hatte. Heute liegt das Start-JS bei etwa 105 kB von 150 kB.
- Die Wochen-Nachricht wird auf dem Gerät zugeschnitten (ADR 0014). Der Absender kennt keine Abos, und dabei bleibt es: Eine Nachricht nur bei Treffern verlangte Abos beim Absender (`docs/ideas.md`, „Stufe 3“).

## Entscheidung

1. **Ein Begriff, ein Zeichen.** Anbieter und Suchen werden mit einer Glocke **abonniert**. Angebote behalten das Herz (Merkliste). Der Speicher der Anbieter bleibt `zwergenplan.anbieter-merkliste`, bestehende gemerkte Anbieter sind damit Abos.
2. **Zuschnitt** (`weeklyText`, `src/domain/news.ts`): Ein neues Angebot ist ein Treffer, wenn das Alter passt und es von einem abonnierten Anbieter stammt oder zu einem Such-Abo passt. Ohne Abo zählt jedes neue Angebot. Treffer der Anbieter stehen vorn. Sind alle Treffer von Anbietern, heißt der Titel „… von deinen Anbietern“, sonst „… für deine Abos“.
3. **Geräte-Speicher**: neuer Schlüssel `providers` (bereinigte `publicId`s). Er wird gespiegelt, solange Push an ist, und beim Abschalten gelöscht. Er verlässt das Gerät nie. Der Service Worker liest ihn neben den anderen Angaben, ohne weiteren Request.
4. **Spiegeln nach dem Tipp**: Jeder Glocken-Tipp ruft `bellPush` (`src/ui/AppExtras.tsx`). Das lädt den App-Chunk und spiegelt lokal (`mirrorIfSubscribed`). Kind-Sheet, Onboarding und Glocken teilen eine `createPush()`-Instanz. Ein Generationszähler verhindert, dass ein Spiegeln nach dem Ausschalten den Speicher wieder füllt.
5. **Glocke bei ausgeschaltetem Push** (Nutzerentscheidung 2026-10-29): Ein neues Abo schaltet die Push-Nachricht ein. Ist die Erlaubnis noch offen, kommt die Abfrage als erster Aufruf im Tipp (iOS, Plan 0011, E12): mit vorgeladenem Chunk über `enablePush`, sonst über `askPushPermission` (`src/data/pwa-start.ts`, der einzige Push-Aufruf im Start, nur im Tipp). Beenden eines Abos schaltet nie etwas.
6. **Requests**:
   - Der Chunk-Request hängt an Tipp bzw. Ansicht, nicht am Gespeicherten. Er kommt beim Abonnieren wie beim Beenden und ist nach dem Precache lokal.
   - An den Push-Worker geht nur das Einschalten (das Abo selbst), wie beim Schalter.
   - Kein Request hängt davon ab, ob oder welche Abos bestehen.
   - Die Verwaltung im Kind-Sheet nennt Anbieter mit Namen aus `site.json` und lädt dafür nicht `anbieter.json`.
7. **Such-Abos im Start**: Die Glocke steht rechts neben der Gruppe „Schnellfilter“, nur im Tab „Angebote“ und nur mit einem Filter außer dem Zeitraum. Die Verwaltung (`AboList` in `src/ui/KidSheet.tsx`) liegt im Start und ist auch ohne Push und offline da.
8. **Budgets**: Der Zuschnitt nach Anbietern kostet den Service Worker 0,1 kB (8,99 → 9,10 kB), Zusammenlegen der Titel sparte nach gzip nichts. Die Grenze liegt inzwischen bei 12 kB (ADR 0012, Nachtrag 2026-10-29), die zugesagte Anhebung auf 9,5 kB (Nutzerentscheidung U3) entfällt. Start-JS 103,44 → 105,29 kB von 150 kB. App-Extras 7,49 → 6,26 kB, denn die Such-Logik ist herausgewandert.

## Alternativen

- **Sofort nach dem Nachtlauf benachrichtigen**: verworfen. Ohne Abos beim Absender bekämen alle täglich eine Nachricht, denn auf dem Gerät lässt sich keine unterdrücken (ADR 0014, Kontext).
- **Anbieter-Abos nur hervorheben, nicht filtern**: verworfen (Nutzerentscheidung U1). Eine Glocke, die nichts filtert, ist kein Abo.
- **Glocke zeigt nur einen Hinweis bei ausgeschaltetem Push**: verworfen (Nutzerentscheidung U2) zugunsten des direkten Einschaltens.
- **Spiegeln erst beim nächsten Öffnen des Kind-Sheets**: verworfen. Die nächste Nachricht wüsste sonst nichts vom neuen Abo.

## Konsequenzen

- Wer bisher nur Anbieter gemerkt hatte, bekommt in der Wochen-Nachricht nur noch deren neue Angebote statt aller altersgerechten. Ein Hinweis an Bestandsnutzer steht in `docs/ideas.md`.
- Ob `pushManager.subscribe` auf iOS nach einem `await` noch ohne Geste klappt, lässt sich nur am echten iPhone prüfen. Synchron im Tipp läuft der Aufruf nur bei offener Erlaubnis („default“) und vorgeladenem Chunk. Bei schon erteilter Erlaubnis und ausgeschaltetem Push (Schalter abgeschaltet) kommt `enablePush` erst nach dem Spiegeln. Beide Fälle gehören in den Spike (Plan 0054, E5).
- Die Installation lädt einen Chunk mehr in den Precache (etwa 6 kB gzip).
