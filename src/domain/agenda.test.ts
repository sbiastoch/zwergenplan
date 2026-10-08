import { describe, expect, it } from "vitest";
import {
  courseProgress,
  dayAgenda,
  endedOnDay,
  groupByNextSession,
  lastSessionDay,
  monthDays,
  nextSession,
  type Occurrence,
  referenceSession,
  rhythm,
  type SessionFit,
  sessionsByDay,
  shownSession,
  takeGroups,
  uniformTimes,
  upcomingSessions,
  weekDays,
} from "./agenda.ts";
import type { Offer, Session } from "./schema.ts";
import { FIXTURE_NOW, fixtureKey, fixtureOffer, loadFixtures } from "./test-fixtures.ts";

const { file } = loadFixtures();
const withSessions = (title: string, sessions: Session[]): Offer => ({
  ...fixtureOffer("krabbeltreff"),
  id: `test--${title}--x`,
  title,
  sessions,
});
const s = (start: string, end: string): Session => ({ start, end });

describe("groupByNextSession", () => {
  it("stellt bei Zeitraum regelmäßige an den ersten Termin darin, Kurse an den Beginn (Plan 0023, E6)", () => {
    const treff = fixtureOffer("krabbeltreff");
    const musikgarten = fixtureOffer("musikgarten-1"); // Beginn 5.11.
    const groups = groupByNextSession([treff, musikgarten], FIXTURE_NOW, { from: "2026-10-27" });
    expect(groups.map((g) => [g.day, g.items.map((i) => fixtureKey(i.offer))])).toEqual([
      ["2026-10-28", ["krabbeltreff"]],
      ["2026-11-05", ["musikgarten-1"]],
    ]);
    // Ein Kurs, der vor dem Zeitraum begonnen hat, fehlt.
    expect(groupByNextSession([fixtureOffer("pekip-herbst")], FIXTURE_NOW, { from: "2026-10-20" })).toEqual([]);
  });

  it("zeigt jedes Angebot einmal am nächsten Termin, nach Berliner Tag gruppiert", () => {
    const groups = groupByNextSession(file.offers, FIXTURE_NOW);
    expect(groups.map((g) => g.day)).toEqual([
      "2026-10-07",
      "2026-10-09",
      "2026-10-13",
      "2026-10-17",
      "2026-10-20",
      "2026-11-05",
      "2026-11-15",
      "2026-12-06",
    ]);
    expect(groups[0]?.items.map((i) => fixtureKey(i.offer))).toEqual(["krabbeltreff"]);
    expect(groups[0]?.items[0]?.session.start).toBe("2026-10-07T10:00:00+02:00");
    const all = groups.flatMap((g) => g.items.map((i) => fixtureKey(i.offer)));
    expect(all).not.toContain("vergangen");
    expect(new Set(all).size).toBe(all.length);
  });

  it("zählt einen laufenden Termin als nächsten und sortiert über Mitternacht in Berlin", () => {
    const now = new Date("2026-10-05T10:30:00+02:00");
    const running = withSessions("Läuft gerade", [s("2026-10-05T10:00:00+02:00", "2026-10-05T11:00:00+02:00")]);
    // 00:30 Berlin am 6.10. ist in UTC noch der 5.10.
    const night = withSessions("Nachts", [s("2026-10-06T00:30:00+02:00", "2026-10-06T01:00:00+02:00")]);
    const groups = groupByNextSession([night, running], now);
    expect(groups.map((g) => [g.day, g.items.map((i) => i.offer.title)])).toEqual([
      ["2026-10-05", ["Läuft gerade"]],
      ["2026-10-06", ["Nachts"]],
    ]);
  });

  it("sortiert bei gleichem Beginn nach Titel", () => {
    const a = withSessions("B-Kurs", [s("2026-10-08T10:00:00+02:00", "2026-10-08T11:00:00+02:00")]);
    const b = withSessions("A-Kurs", [s("2026-10-08T10:00:00+02:00", "2026-10-08T11:00:00+02:00")]);
    expect(groupByNextSession([a, b], FIXTURE_NOW)[0]?.items.map((i) => i.offer.title)).toEqual(["A-Kurs", "B-Kurs"]);
  });
});

describe("takeGroups", () => {
  const groups = [
    { day: "2026-10-07", items: [1, 2, 3] },
    { day: "2026-10-08", items: [4, 5] },
    { day: "2026-10-09", items: [6] },
  ];

  it("nimmt genau `limit` Einträge und kürzt notfalls die letzte Tagesgruppe", () => {
    // Echte Daten: Ein einziger Tag kann > 90 Angebote haben – sonst wäre der erste Schritt unbegrenzt.
    expect(takeGroups(groups, 4)).toEqual({
      groups: [groups[0], { day: "2026-10-08", items: [4] }],
      remaining: 2,
    });
    expect(takeGroups(groups, 3)).toEqual({ groups: groups.slice(0, 1), remaining: 3 });
    expect(takeGroups(groups, 1)).toEqual({ groups: [{ day: "2026-10-07", items: [1] }], remaining: 5 });
  });

  it("lässt die Eingabe unverändert", () => {
    takeGroups(groups, 2);
    expect(groups[0]?.items).toEqual([1, 2, 3]);
  });

  it("gibt alles zurück, wenn das Limit reicht", () => {
    expect(takeGroups(groups, 6)).toEqual({ groups, remaining: 0 });
    expect(takeGroups([], 40)).toEqual({ groups: [], remaining: 0 });
  });
});

describe("shownSession und SessionFit (Plan 0028)", () => {
  const treff = fixtureOffer("krabbeltreff"); // mittwochs 7.10.–4.11.
  const fromOct21: SessionFit = (_offer, session) => session.start >= "2026-10-21";
  const never: SessionFit = () => false;

  it("nimmt ohne Prädikat den nächsten Termin bzw. den Termin im Zeitraum", () => {
    expect(shownSession(treff, FIXTURE_NOW)).toEqual(nextSession(treff, FIXTURE_NOW));
    expect(shownSession(treff, FIXTURE_NOW, { from: "2026-10-13" })?.start).toBe("2026-10-14T10:00:00+02:00");
  });

  it("nimmt mit Prädikat den ersten passenden kommenden Termin, auch im Zeitraum", () => {
    expect(shownSession(treff, FIXTURE_NOW, undefined, fromOct21)?.start).toBe("2026-10-21T10:00:00+02:00");
    expect(shownSession(treff, FIXTURE_NOW, { to: "2026-10-28" }, fromOct21)?.start).toBe("2026-10-21T10:00:00+02:00");
  });

  it("fällt ohne passenden Termin auf den nächsten bzw. den im Zeitraum zurück", () => {
    expect(shownSession(treff, FIXTURE_NOW, undefined, never)).toEqual(treff.sessions[0]);
    expect(shownSession(treff, FIXTURE_NOW, { to: "2026-10-14" }, fromOct21)).toEqual(treff.sessions[0]);
    expect(shownSession(treff, FIXTURE_NOW, { from: "2026-12-01" }, fromOct21)).toBeUndefined();
  });

  it("stellt Angebote in der Liste an den passenden Termin", () => {
    const reime = fixtureOffer("krabbelreime"); // ab 9.10.
    const groups = groupByNextSession([treff, reime], FIXTURE_NOW, undefined, (o, s) => o !== treff || fromOct21(o, s));
    expect(groups.map((g) => [g.day, g.items.map((i) => fixtureKey(i.offer))])).toEqual([
      ["2026-10-09", ["krabbelreime"]],
      ["2026-10-21", ["krabbeltreff"]],
    ]);
  });

  it("lässt im Kalender-Index nur passende Termine", () => {
    const index = sessionsByDay([treff], fromOct21);
    expect([...index.keys()]).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
  });
});

describe("sessionsByDay", () => {
  it("indiziert alle Termine nach Berliner Tag, je Tag nach Uhrzeit", () => {
    const a = withSessions("Spät", [s("2026-10-08T15:00:00+02:00", "2026-10-08T16:00:00+02:00")]);
    const b = withSessions("Früh", [
      s("2026-10-07T23:30:00+02:00", "2026-10-08T00:30:00+02:00"),
      s("2026-10-08T09:00:00+02:00", "2026-10-08T10:00:00+02:00"),
    ]);
    const index = sessionsByDay([a, b]);
    expect(index.get("2026-10-08")?.map((o) => [o.offer.title, o.session.start])).toEqual([
      ["Früh", "2026-10-08T09:00:00+02:00"],
      ["Spät", "2026-10-08T15:00:00+02:00"],
    ]);
    expect(index.get("2026-10-07")?.map((o) => o.offer.title)).toEqual(["Früh"]);
    expect(index.get("2026-10-09")).toBeUndefined();
  });

  it("findet regelmäßige Termine in den Fixtures", () => {
    expect(
      sessionsByDay(file.offers)
        .get("2026-10-14")
        ?.map((o) => fixtureKey(o.offer)),
    ).toEqual(["krabbeltreff"]);
  });
});

describe("Kalenderraster", () => {
  it("liefert die Woche ab Montag, auch über Monats- und Jahresgrenzen", () => {
    expect(weekDays("2026-10-07")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(weekDays("2027-01-01")[0]).toBe("2026-12-28");
    expect(weekDays("2026-11-01")[0]).toBe("2026-10-26");
  });

  it("liefert die Tage des Monats und die Leerspalten davor (Montag zuerst)", () => {
    const nov = monthDays("2026-11-20"); // 1.11.2026 ist ein Sonntag
    expect(nov.lead).toBe(6);
    expect(nov.days[0]).toBe("2026-11-01");
    expect(nov.days.at(-1)).toBe("2026-11-30");
    expect(nov.days).toHaveLength(30);
    const feb = monthDays("2027-02-01"); // Montag → keine Leerspalte
    expect(feb).toMatchObject({ lead: 0, days: expect.arrayContaining(["2027-02-28"]) });
    expect(feb.days).toHaveLength(28);
  });

  it("kennt den letzten Tag mit Terminen", () => {
    expect(lastSessionDay(file.offers)).toBe("2026-12-10");
    expect(lastSessionDay([])).toBeUndefined();
  });
});

describe("courseProgress", () => {
  it("zählt die verbleibenden Termine eines Kurses", () => {
    const pekip = fixtureOffer("pekip-herbst");
    expect(courseProgress(pekip, FIXTURE_NOW)).toEqual({ total: 8, remaining: 8 });
    expect(courseProgress(pekip, new Date("2026-11-04T12:00:00+01:00"))).toEqual({ total: 8, remaining: 4 });
  });
});

describe("rhythm", () => {
  it("erkennt „jede Woche am selben Tag zur selben Zeit“", () => {
    expect(rhythm(fixtureOffer("krabbeltreff"), FIXTURE_NOW)).toEqual({ weekday: 3, weekly: true });
  });

  it("nennt 14-tägliche Reihen nur den Wochentag", () => {
    expect(rhythm(fixtureOffer("krabbelreime"), FIXTURE_NOW)).toEqual({ weekday: 5, weekly: false });
  });

  it("liefert nichts bei gemischten Wochentagen, einem einzigen oder keinem kommenden Termin", () => {
    const mixed = withSessions("Mo und Mi", [
      s("2026-10-12T10:00:00+02:00", "2026-10-12T11:00:00+02:00"),
      s("2026-10-14T10:00:00+02:00", "2026-10-14T11:00:00+02:00"),
    ]);
    expect(rhythm(mixed, FIXTURE_NOW)).toBeUndefined();
    const single = withSessions("einer", [s("2026-10-12T10:00:00+02:00", "2026-10-12T11:00:00+02:00")]);
    expect(rhythm(single, FIXTURE_NOW)).toBeUndefined();
    const past = withSessions("vorbei", [s("2026-10-01T10:00:00+02:00", "2026-10-01T11:00:00+02:00")]);
    expect(rhythm(past, FIXTURE_NOW)).toBeUndefined();
  });

  it("ist nicht wöchentlich, wenn die Uhrzeit wechselt", () => {
    const shifted = withSessions("verschoben", [
      s("2026-10-12T10:00:00+02:00", "2026-10-12T11:00:00+02:00"),
      s("2026-10-19T15:00:00+02:00", "2026-10-19T16:00:00+02:00"),
    ]);
    expect(rhythm(shifted, FIXTURE_NOW)).toEqual({ weekday: 1, weekly: false });
  });
});

describe("uniformTimes", () => {
  it("erkennt gleiche Uhrzeiten über die Zeitumstellung hinweg", () => {
    expect(uniformTimes(fixtureOffer("pekip-herbst").sessions)).toBe(true);
    expect(
      uniformTimes([
        s("2026-10-12T10:00:00+02:00", "2026-10-12T11:00:00+02:00"),
        s("2026-10-19T10:30:00+02:00", "2026-10-19T11:00:00+02:00"),
      ]),
    ).toBe(false);
  });
});

describe("upcomingSessions / nextSession", () => {
  const treff = fixtureOffer("krabbeltreff");
  it("liefert die nicht beendeten Termine, ein laufender zählt mit", () => {
    const running = new Date("2026-10-07T10:30:00+02:00");
    expect(upcomingSessions(treff, running)[0]?.start).toBe("2026-10-07T10:00:00+02:00");
    expect(upcomingSessions(treff, running)).toHaveLength(treff.sessions.length);
    expect(upcomingSessions(treff, new Date("2026-10-07T12:00:00+02:00"))).toHaveLength(treff.sessions.length - 1);
    expect(upcomingSessions(treff, new Date("2027-01-01T00:00:00+01:00"))).toEqual([]);
  });

  it("liefert den nächsten nicht beendeten Termin", () => {
    expect(nextSession(treff, new Date("2026-10-07T11:00:00+02:00"))?.start).toBe("2026-10-07T10:00:00+02:00");
    expect(nextSession(treff, new Date("2026-10-07T12:00:00+02:00"))?.start).toBe("2026-10-14T10:00:00+02:00");
    expect(nextSession(treff, new Date("2027-01-01T00:00:00+01:00"))).toBeUndefined();
  });
});

describe("referenceSession", () => {
  const treff = fixtureOffer("krabbeltreff");
  it("nimmt den gewählten Berliner Kalendertag, sonst den nächsten Termin", () => {
    expect(referenceSession(treff, FIXTURE_NOW, "2026-10-14")?.start).toBe("2026-10-14T10:00:00+02:00");
    expect(referenceSession(treff, FIXTURE_NOW)?.start).toBe("2026-10-07T10:00:00+02:00");
    // Tag ohne Termin: zurück auf den nächsten Termin
    expect(referenceSession(treff, FIXTURE_NOW, "2026-10-08")?.start).toBe("2026-10-07T10:00:00+02:00");
  });

  it("nimmt mit Prädikat ohne gewählten Tag den ersten passenden Termin, sonst den nächsten (Browser-Review 0028)", () => {
    const fromOct21: SessionFit = (_offer, session) => session.start >= "2026-10-21";
    expect(referenceSession(treff, FIXTURE_NOW, undefined, fromOct21)?.start).toBe("2026-10-21T10:00:00+02:00");
    // Tag ohne Termin: wie ohne Tag
    expect(referenceSession(treff, FIXTURE_NOW, "2026-10-08", fromOct21)?.start).toBe("2026-10-21T10:00:00+02:00");
    // gewählter Tag gilt, auch wenn er nicht passt (Kalender)
    expect(referenceSession(treff, FIXTURE_NOW, "2026-10-14", fromOct21)?.start).toBe("2026-10-14T10:00:00+02:00");
    // nichts passt: wie bisher der nächste
    expect(referenceSession(treff, FIXTURE_NOW, undefined, () => false)?.start).toBe("2026-10-07T10:00:00+02:00");
  });

  it("ordnet späte Termine dem Berliner Tag zu, nicht dem UTC- oder Gerätetag", () => {
    const late = withSessions("spaet", [
      s("2026-10-12T23:30:00+02:00", "2026-10-12T23:59:00+02:00"),
      s("2026-10-13T00:30:00+02:00", "2026-10-13T01:00:00+02:00"),
    ]);
    expect(referenceSession(late, FIXTURE_NOW, "2026-10-12")?.start).toBe("2026-10-12T23:30:00+02:00");
    expect(referenceSession(late, FIXTURE_NOW, "2026-10-13")?.start).toBe("2026-10-13T00:30:00+02:00");
  });
});

describe("endedOnDay", () => {
  const treff = fixtureOffer("krabbeltreff"); // Mi 7.10. 10:00–11:30, dann wöchentlich

  it("zählt nur Termine des Tages, die vor jetzt beendet sind", () => {
    expect(endedOnDay([treff], "2026-10-07", new Date("2026-10-07T20:00:00+02:00"))).toBe(1);
    expect(endedOnDay([treff], "2026-10-07", new Date("2026-10-07T11:00:00+02:00"))).toBe(0);
    expect(endedOnDay([treff], "2026-10-14", new Date("2026-10-07T20:00:00+02:00"))).toBe(0);
  });

  it("zählt einen Termin, der genau jetzt endet, noch nicht (er läuft noch)", () => {
    expect(endedOnDay([treff], "2026-10-07", new Date("2026-10-07T11:30:00+02:00"))).toBe(0);
    expect(endedOnDay([treff], "2026-10-07", new Date("2026-10-07T11:30:00.001+02:00"))).toBe(1);
  });

  it("findet Einzeltermine, die heute schon vorbei sind (Fixtures: Elterncafé am Mo 5.10.)", () => {
    expect(endedOnDay(file.offers, "2026-10-05", FIXTURE_NOW)).toBe(1);
  });

  it("ordnet einen Termin um 00:30 Berlin dem Berliner Tag zu (Test läuft in LA)", () => {
    const night = withSessions("Nachts", [s("2026-10-08T00:30:00+02:00", "2026-10-08T01:00:00+02:00")]);
    const now = new Date("2026-10-08T09:00:00+02:00");
    expect(endedOnDay([night], "2026-10-08", now)).toBe(1);
    expect(endedOnDay([night], "2026-10-07", now)).toBe(0);
  });
});

describe("dayAgenda", () => {
  const treff = fixtureOffer("krabbeltreff");
  const index = sessionsByDay([treff]);
  const at = (iso: string) => new Date(iso);
  const context = (endedToday = 0, dataEnd: string | undefined = "2026-11-04") => ({
    dataEnd,
    endedToday,
    allIndex: index,
  });
  const noDataEnd = { dataEnd: undefined, endedToday: 0, allIndex: index };

  it("lässt abends beendete Termine von heute weg und zählt sie", () => {
    const now = at("2026-10-07T20:00:00+02:00");
    const agenda = dayAgenda(index, "2026-10-07", now, context(endedOnDay([treff], "2026-10-07", now)));
    expect(agenda).toEqual({ items: [], ended: 1, afterData: false, hidden: 0 });
  });

  it("behält einen laufenden Termin", () => {
    const agenda = dayAgenda(index, "2026-10-07", at("2026-10-07T11:00:00+02:00"), context());
    expect(agenda.items.map((o) => o.session.start)).toEqual(["2026-10-07T10:00:00+02:00"]);
    expect(agenda.ended).toBe(0);
  });

  it("behält einen Termin, der genau jetzt endet", () => {
    expect(dayAgenda(index, "2026-10-07", at("2026-10-07T11:30:00+02:00"), context()).items).toHaveLength(1);
  });

  it("nennt Beendetes nur für heute, nie für künftige Tage", () => {
    const now = at("2026-10-07T20:00:00+02:00");
    expect(dayAgenda(index, "2026-10-07", now, context(3)).ended).toBe(3);
    const future = dayAgenda(index, "2026-10-14", now, context(3));
    expect(future.ended).toBe(0);
    expect(future.items).toHaveLength(1);
  });

  it("erkennt Tage nach dem letzten Termin des Datenstands", () => {
    const now = at("2026-10-07T12:00:00+02:00");
    expect(dayAgenda(index, "2026-11-05", now, context(0, "2026-11-04")).afterData).toBe(true);
    expect(dayAgenda(index, "2026-11-04", now, context(0, "2026-11-04")).afterData).toBe(false);
    expect(dayAgenda(index, "2026-11-05", now, noDataEnd).afterData).toBe(false);
    expect(dayAgenda(new Map(), "2026-11-05", now, context(0, "2026-11-04")).items).toEqual([]);
  });

  it("ordnet einen Termin um 00:30 Berlin dem Berliner Tag zu (Test läuft in LA)", () => {
    const night = withSessions("Nachts", [s("2026-10-08T00:30:00+02:00", "2026-10-08T01:00:00+02:00")]);
    const nightIndex = sessionsByDay([night]);
    // 7.10. 20:00 Berlin = 7.10. 11:00 in LA; „heute“ ist trotzdem der Berliner 7.10.
    const now = at("2026-10-07T20:00:00+02:00");
    const nightContext = { ...context(5), allIndex: nightIndex };
    expect(dayAgenda(nightIndex, "2026-10-08", now, nightContext).items).toHaveLength(1);
    expect(dayAgenda(nightIndex, "2026-10-08", now, nightContext).ended).toBe(0);
    expect(dayAgenda(nightIndex, "2026-10-07", now, nightContext)).toEqual({
      items: [],
      ended: 5,
      afterData: false,
      hidden: 0,
    });
  });

  describe("ausgeblendete Termine (Plan 0008, E12)", () => {
    // Index der sichtbaren Angebote: leer, als blendeten Filter, Umkreis oder Alter den Treff aus.
    const none = new Map<string, Occurrence[]>();

    it("zählt die Termine des Tages, die die Auswahl ausblendet", () => {
      const now = at("2026-10-05T12:00:00+02:00");
      const agenda = dayAgenda(none, "2026-10-07", now, context());
      expect(agenda.items).toEqual([]);
      expect(agenda.hidden).toBe(1);
      // nichts ausgeblendet, wenn der Treff sichtbar ist
      expect(dayAgenda(index, "2026-10-07", now, context()).hidden).toBe(0);
    });

    it("zählt die Differenz, nie weniger als 0", () => {
      const other = withSessions("Anderes", [s("2026-10-07T15:00:00+02:00", "2026-10-07T16:00:00+02:00")]);
      const allIndex = sessionsByDay([treff, other]);
      const now = at("2026-10-05T12:00:00+02:00");
      expect(dayAgenda(index, "2026-10-07", now, { ...context(), allIndex }).hidden).toBe(1);
      expect(dayAgenda(none, "2026-10-07", now, { ...context(), allIndex }).hidden).toBe(2);
      // Index größer als allIndex (darf nicht vorkommen): trotzdem nie negativ
      expect(dayAgenda(allIndex, "2026-10-07", now, context()).hidden).toBe(0);
    });

    it("zählt beendete Termine nicht mit", () => {
      const evening = at("2026-10-07T20:00:00+02:00");
      expect(dayAgenda(none, "2026-10-07", evening, context()).hidden).toBe(0);
    });

    it("ist 0, wenn der ungefilterte Index den Tag nicht kennt", () => {
      const now = at("2026-10-05T12:00:00+02:00");
      expect(dayAgenda(none, "2026-10-08", now, context()).hidden).toBe(0);
      expect(dayAgenda(none, "2026-10-07", now, { ...context(), allIndex: new Map() }).hidden).toBe(0);
    });

    it("nennt heute Beendetes und Ausgeblendetes zugleich", () => {
      // heute: ein passender Termin ist vorbei (endedToday 1), ein ausgeblendeter kommt noch
      const later = withSessions("Später", [s("2026-10-07T15:00:00+02:00", "2026-10-07T16:00:00+02:00")]);
      const now = at("2026-10-07T12:00:00+02:00");
      const agenda = dayAgenda(none, "2026-10-07", now, { ...context(1), allIndex: sessionsByDay([treff, later]) });
      expect(agenda).toEqual({ items: [], ended: 1, afterData: false, hidden: 1 });
    });

    it("ordnet einen ausgeblendeten Termin um 00:30 Berlin dem Berliner Tag zu (Test läuft in LA)", () => {
      const night = withSessions("Nachts", [s("2026-10-08T00:30:00+02:00", "2026-10-08T01:00:00+02:00")]);
      const allIndex = sessionsByDay([night]);
      const now = at("2026-10-07T20:00:00+02:00");
      expect(dayAgenda(none, "2026-10-08", now, { ...context(), allIndex }).hidden).toBe(1);
      expect(dayAgenda(none, "2026-10-07", now, { ...context(), allIndex }).hidden).toBe(0);
    });
  });
});
