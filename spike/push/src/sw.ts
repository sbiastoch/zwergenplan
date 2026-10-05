// Service Worker der Spike-Seite, als Text ausgeliefert. Jede Beobachtung geht per
// POST /spike/log ins Protokoll. Varianten kommen über notification.data.variant.

export const SW_JS = `
const START = Date.now();

function log(msg, extra) {
  return fetch("/spike/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ src: "sw", msg: msg, swAlterMs: Date.now() - START }, extra || {})),
  }).catch(function () {});
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function idbGet(key) {
  return new Promise(function (resolve, reject) {
    const open = indexedDB.open("spike", 1);
    open.onupgradeneeded = function () { open.result.createObjectStore("kv"); };
    open.onerror = function () { reject(open.error); };
    open.onsuccess = function () {
      const req = open.result.transaction("kv").objectStore("kv").get(key);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    };
  });
}

function describe(n) {
  if (!n) return null;
  const out = {};
  ["title", "body", "tag", "lang", "dir", "silent", "navigate", "icon", "badge", "timestamp"].forEach(function (k) {
    try { if (k in n) out[k] = n[k]; } catch (e) { out[k] = "(Fehler: " + e + ")"; }
  });
  try { out.data = n.data; } catch (e) { out.data = "(Fehler: " + e + ")"; }
  try { out.ctor = n.constructor && n.constructor.name; } catch (e) {}
  return out;
}

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (event) {
  const t0 = Date.now();
  const hasNotificationProp = "notification" in event;
  const n = hasNotificationProp ? event.notification : undefined;
  let payload = null;
  let payloadErr = null;
  try { payload = event.data ? event.data.json() : null; } catch (e) { payloadErr = String(e); }
  const proposed = n ? describe(n) : (payload && payload.notification) || null;
  const data = (proposed && proposed.data) || {};
  const variant = data.variant || "unbekannt";
  const sentAt = data.sentAt;
  const info = {
    variant: variant,
    hasNotificationProp: hasNotificationProp,
    notification: describe(n),
    hasData: !!event.data,
    payloadKeys: payload ? Object.keys(payload) : null,
    payloadErr: payloadErr,
    latenzMs: sentAt ? t0 - Date.parse(sentAt) : null,
  };

  if (variant === "werfen-sync") {
    log("push: werfe synchron", info);
    throw new Error("Spike: absichtlich geworfen");
  }

  const title = (proposed && proposed.title) || "Spike (ohne Titel)";
  const tag = (proposed && proposed.tag) || "spike";
  const navigate = proposed && proposed.navigate;

  function show(t, opts) {
    return self.registration.showNotification(t, Object.assign({ tag: tag, lang: "de" }, opts)).then(
      function () { return log("push: showNotification ok", { variant: variant, titel: t, nachMs: Date.now() - t0 }); },
      function (e) { return log("push: showNotification FEHLER", { variant: variant, fehler: String(e) }); }
    );
  }

  function showProposed() {
    return show(title, { body: proposed && proposed.body, data: data, navigate: navigate });
  }

  let work;
  if (variant === "nichts" || variant === "badge" || variant === "fest") {
    // Declarative: nichts anzeigen, das System zeigt die vorgeschlagene Nachricht.
    work = n ? Promise.resolve() : showProposed();
  } else if (variant === "ersetzen") {
    work = show("ERSETZT: " + title, { body: "Vom Service Worker nach " + (Date.now() - t0) + " ms", data: data, navigate: navigate });
  } else if (variant.indexOf("warten-") === 0) {
    const seconds = Number(variant.slice(7));
    work = (async function () {
      for (let s = 2; s <= seconds; s += 2) {
        await sleep(2000);
        log("push: lebt noch", { variant: variant, nachMs: Date.now() - t0 });
      }
      await sleep(Math.max(0, seconds * 1000 - (Date.now() - t0)));
      return show("ERSETZT nach " + seconds + " s", { body: "Service Worker hat " + (Date.now() - t0) + " ms gebraucht", data: data, navigate: navigate });
    })();
  } else if (variant === "werfen-async") {
    work = log("push: werfe asynchron", info).then(function () { throw new Error("Spike: absichtlich asynchron geworfen"); });
  } else if (variant === "site-json") {
    work = (async function () {
      const res = await fetch("https://zwergenplan.app/data/site.json", { cache: "no-cache" });
      const site = await res.json();
      const tFetch = Date.now() - t0;
      const birth = await idbGet("geburtsdatum");
      const tIdb = Date.now() - t0;
      return show("ERSETZT: " + site.offers.length + " Angebote", {
        body: "Geburtsdatum " + birth + ", site.json " + tFetch + " ms, IDB " + tIdb + " ms",
        data: data,
        navigate: navigate,
      });
    })();
  } else if (variant === "badge-sw") {
    work = (self.navigator.setAppBadge ? self.navigator.setAppBadge(7).then(function () { return log("push: setAppBadge(7) ok"); }, function (e) { return log("push: setAppBadge FEHLER", { fehler: String(e) }); }) : log("push: kein setAppBadge im SW")).then(function () {
      return show("ERSETZT: Badge 7 vom Service Worker", { body: "Steht 7 am Icon?", data: data, navigate: navigate });
    });
  } else if (variant === "navigate-sw") {
    work = show("ERSETZT: navigate-Option", { body: "Tippen: Seite sollte ziel=sw-navigate zeigen", data: data, navigate: self.registration.scope + "?ziel=sw-navigate" });
  } else if (variant === "klick") {
    work = show("ERSETZT: ohne navigate", { body: "Tippen: notificationclick soll ziel=klick öffnen", data: Object.assign({}, data, { url: self.registration.scope + "?ziel=klick" }) });
  } else {
    work = n ? Promise.resolve() : showProposed();
  }

  event.waitUntil(Promise.all([log("push: empfangen", info), work.catch(function (e) { return log("push: Arbeit FEHLER", { variant: variant, fehler: String(e) }); })]));
});

self.addEventListener("notificationclick", function (event) {
  const n = event.notification;
  const target = (n.data && n.data.url) || self.registration.scope + "?ziel=klick-ohne-url";
  n.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      log("notificationclick", { titel: n.title, fenster: list.length, target: target });
      if (list.length) {
        const client = list[0];
        return client.focus()
          .then(function (focused) { return (focused || client).navigate(target); })
          .then(
            function (r) { return log("klick: navigate ok", { ergebnis: r ? r.url : String(r) }); },
            function (e) { return log("klick: navigate FEHLER", { fehler: String(e) }).then(function () { return self.clients.openWindow(target); }); }
          );
      }
      return self.clients.openWindow(target).then(function (r) { return log("klick: openWindow", { ergebnis: r ? r.url : String(r) }); });
    })
  );
});

self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(log("pushsubscriptionchange", { neu: !!event.newSubscription, alt: !!event.oldSubscription }));
});
`;
