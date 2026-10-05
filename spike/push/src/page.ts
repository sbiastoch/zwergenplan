// Spike-Seite: Diagnose, Speicher-Marke (h), Anmeldung (a, i), Protokoll.

export const PAGE_HTML = String.raw`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ZP Spike">
<link rel="manifest" href="/spike/manifest.webmanifest">
<title>Zwergenplan Spike</title>
<style>
  body { font: 16px/1.4 system-ui, sans-serif; margin: 0; padding: 16px; padding-top: max(16px, env(safe-area-inset-top)); background: #fff8ec; color: #2b2118; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 20px 0 6px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  td { border-top: 1px solid #e6d8c3; padding: 4px 6px 4px 0; vertical-align: top; word-break: break-word; }
  td:first-child { color: #6b5a48; width: 42%; }
  button { display: block; width: 100%; min-height: 44px; margin: 8px 0; font: inherit; border-radius: 12px; border: 2px solid #2b2118; background: #ffd66b; }
  .big { font-size: 28px; font-weight: 700; letter-spacing: 2px; }
  pre { font-size: 12px; white-space: pre-wrap; word-break: break-word; background: #fff; padding: 8px; border-radius: 8px; }
  .hint { background: #fff; border-left: 4px solid #ffd66b; padding: 8px; }
</style>
</head>
<body>
<h1>Zwergenplan Spike (Push)</h1>
<p id="ctx" class="hint"></p>
<table id="status"></table>

<h2>Geräte-Kennung</h2>
<p class="big" id="kennung">–</p>

<h2>Aktionen</h2>
<button id="marke">Speicher-Marke hier setzen</button>
<button id="abo-a">A: Erlauben, dann abonnieren</button>
<button id="abo-b">B: Direkt abonnieren</button>
<button id="mitteilungen">Mitteilungen auslesen</button>
<button id="badge-setzen">Badge 3 setzen (Seite)</button>
<button id="badge-leeren">Badge leeren</button>
<button id="neu">Protokoll neu laden</button>

<h2>Protokoll (neueste zuerst)</h2>
<pre id="protokoll">lädt …</pre>

<script type="module">
const VAPID_PUBLIC = "__VAPID_PUBLIC__";
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ctx = standalone ? "app" : "browser";
const $ = (id) => document.getElementById(id);
let reg = null;

function log(msg, extra) {
  return fetch("/spike/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ src: "seite", ctx, kennung: localStorage.getItem("spike-kennung"), msg }, extra || {})),
  }).catch(() => {});
}

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("spike", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("kv", mode).objectStore("kv"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}
const idbGet = (k) => idb("readonly", (s) => s.get(k));
const idbSet = (k, v) => idb("readwrite", (s) => s.put(v, k));

function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function status() {
  const sub = reg ? await reg.pushManager.getSubscription().catch((e) => "Fehler: " + e) : null;
  const rows = {
    Kontext: ctx,
    "display-mode standalone": String(matchMedia("(display-mode: standalone)").matches),
    "navigator.standalone": String(navigator.standalone),
    "serviceWorker": String("serviceWorker" in navigator),
    "PushManager (global)": String("PushManager" in window),
    "window.pushManager (Declarative)": String("pushManager" in window),
    "Notification.permission": "Notification" in window ? Notification.permission : "(kein Notification)",
    "SW aktiv": reg && reg.active ? "ja (" + reg.scope + ")" : "nein",
    "SW kontrolliert Seite": String(!!navigator.serviceWorker && !!navigator.serviceWorker.controller),
    "Abo (Push-Dienst)": sub && sub.endpoint ? new URL(sub.endpoint).host : String(sub),
    "setAppBadge": String("setAppBadge" in navigator),
    "Marke localStorage": localStorage.getItem("spike-marke") || "(keine)",
    "Marke IndexedDB": (await idbGet("marke").catch((e) => "Fehler: " + e)) || "(keine)",
    "URL": location.href,
    "User-Agent": navigator.userAgent,
  };
  $("status").replaceChildren(...Object.entries(rows).map(([k, v]) => {
    const tr = document.createElement("tr");
    const a = document.createElement("td"); a.textContent = k;
    const b = document.createElement("td"); b.textContent = v;
    tr.append(a, b);
    return tr;
  }));
  $("kennung").textContent = localStorage.getItem("spike-kennung") || "–";
  return { rows, sub };
}

async function protokoll() {
  const res = await fetch("/spike/logs", { cache: "no-store" });
  const logs = await res.json();
  $("protokoll").textContent = logs.slice(0, 60).map((l) => JSON.stringify(l)).join("\n\n");
}

async function register(sub, via) {
  const res = await fetch("/spike/abo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), ctx, via, ua: navigator.userAgent }),
  });
  const { kennung } = await res.json();
  localStorage.setItem("spike-kennung", kennung);
  await idbSet("geburtsdatum", "2025-08-01");
  await log("abo gemeldet", { via, host: new URL(sub.endpoint).host });
}

$("ctx").textContent = standalone
  ? "Läuft als App vom Home-Bildschirm."
  : "Läuft im Browser. Für Push: Teilen → „Zum Home-Bildschirm“ und die App von dort öffnen.";

$("marke").onclick = async () => {
  const value = ctx + " " + new Date().toLocaleString("de-DE");
  localStorage.setItem("spike-marke", value);
  await idbSet("marke", value);
  await log("marke gesetzt", { value });
  await status();
};

// Spike (i): requestPermission ist das erste await, subscribe kommt danach.
$("abo-a").onclick = async () => {
  let perm;
  try {
    perm = await Notification.requestPermission();
  } catch (e) {
    await log("A: requestPermission FEHLER", { fehler: String(e) });
    return;
  }
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
    await log("A: subscribe ok", { perm });
    await register(sub, "A");
  } catch (e) {
    await log("A: subscribe FEHLER", { perm, fehler: String(e) });
  }
  await status();
  await protokoll();
};

$("abo-b").onclick = async () => {
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
    await log("B: subscribe ok", { perm: Notification.permission });
    await register(sub, "B");
  } catch (e) {
    await log("B: subscribe FEHLER", { perm: "Notification" in window ? Notification.permission : null, fehler: String(e) });
  }
  await status();
  await protokoll();
};

$("mitteilungen").onclick = async () => {
  const list = reg ? await reg.getNotifications() : [];
  await log("getNotifications", { anzahl: list.length, titel: list.map((n) => n.title + " | " + n.body + " | tag=" + n.tag) });
  await protokoll();
};

$("badge-setzen").onclick = async () => {
  try { await navigator.setAppBadge(3); await log("seite: setAppBadge(3) ok"); }
  catch (e) { await log("seite: setAppBadge FEHLER", { fehler: String(e) }); }
};
$("badge-leeren").onclick = async () => {
  try { await navigator.clearAppBadge(); await log("seite: clearAppBadge ok"); }
  catch (e) { await log("seite: clearAppBadge FEHLER", { fehler: String(e) }); }
};
$("neu").onclick = () => { status(); protokoll(); };

(async () => {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/spike/sw.js", { scope: "/spike/" });
      reg = await navigator.serviceWorker.ready;
    } catch (e) {
      await log("SW-Registrierung FEHLER", { fehler: String(e) });
    }
  }
  const { rows } = await status();
  const notes = reg ? await reg.getNotifications().catch(() => []) : [];
  await log("seite geladen", {
    ziel: new URLSearchParams(location.search).get("ziel"),
    href: location.href,
    marke: rows["Marke localStorage"],
    markeIdb: rows["Marke IndexedDB"],
    permission: rows["Notification.permission"],
    abo: rows["Abo (Push-Dienst)"],
    pushManagerGlobal: rows["PushManager (global)"],
    windowPushManager: rows["window.pushManager (Declarative)"],
    mitteilungen: notes.map((n) => n.title + " | tag=" + n.tag),
    ua: navigator.userAgent,
  });
  await protokoll();
})();
</script>
</body>
</html>
`;
