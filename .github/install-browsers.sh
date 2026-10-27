#!/usr/bin/env bash
# Playwright-Browser samt Systempaketen installieren, ohne an apt zu hängen.
# Aufruf: .github/install-browsers.sh <chromium|webkit>
#
# Am 2026-10-08 hing `apt-get update` (aus `--with-deps`) in mehreren Jobs je Lauf bis zum Job-Timeout:
# azure.archive.ubuntu.com antwortete nicht, danach stand der Abruf ohne Zeitlimit.
# Ein zweiter Versuch scheiterte am dpkg-Lock des verwaisten, als root laufenden apt-get (8a75abb).
# Deshalb: kurze Netz-Zeitlimits für apt, und vor jedem neuen Versuch verwaistes apt beenden und dpkg aufräumen.
# Gemessen dauert die Installation 22–37 s.
#
# Am 2026-10-27 lieferte azure.archive.ubuntu.com auf 24.04 und 26.04 teils ~40 kB/s (3,5 MB in 83 s); bei ~180 Paketen
# (115–140 MB) rissen alle drei Versuche (Plan 0052). apt weicht über die Spiegelliste der Runner-Images nur bei
# Fehlern aus, nicht bei Langsamkeit. Deshalb ab dem zweiten Versuch ohne den Azure-Spiegel; mit
# ZP_APT_SKIP_AZURE=1 schon ab dem ersten (zum Prüfen des Wegs, Plan 0052).
MIRRORS=/etc/apt/apt-mirrors.txt
skip_azure() {
  [[ -f "$MIRRORS" ]] && grep -q 'azure\.archive\.ubuntu\.com' "$MIRRORS" || return 0
  sudo sed -i '/azure\.archive\.ubuntu\.com/d' "$MIRRORS"
  [[ -s "$MIRRORS" ]] || echo "http://archive.ubuntu.com/ubuntu/" | sudo tee "$MIRRORS" >/dev/null
  echo "::notice::Spiegelliste ohne Azure vor Versuch $1: $(tr '\n\t' '  ' < "$MIRRORS")"
}
set -uo pipefail
engine="$1"

sudo tee /etc/apt/apt.conf.d/99-zp-ci >/dev/null <<'EOF'
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
Acquire::Retries "3";
DPkg::Lock::Timeout "60";
EOF

[[ "${ZP_APT_SKIP_AZURE:-}" == 1 ]] && skip_azure 1
for i in 1 2 3; do
  timeout -k 10 150 pnpm exec playwright install --with-deps "$engine" && exit 0
  echo "::warning::Browser-Installation Versuch $i hing oder schlug fehl, neuer Versuch"
  # Die Klammern verhindern, dass das Muster die eigene sudo-Kommandozeile trifft.
  sudo pkill -9 -f 'apt-ge[t] |/usr/lib/apt/method[s]/' || true
  sudo dpkg --configure -a || true
  skip_azure $((i + 1))
done
exit 1
