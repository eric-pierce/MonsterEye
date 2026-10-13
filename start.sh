#!/usr/bin/env bash
# Monster Eye launcher: works on Linux (incl. Raspberry Pi), macOS and the BSDs.
#
#   ./start.sh              start the server and open the eye full-screen
#   ./start.sh --windowed   open in a normal window (handy for testing)
#   ./start.sh --no-browser run only the server (view it from another device)
#   ./start.sh --stop       stop a server left running in the background
#   ./start.sh --port 8080  use a different port (or set PORT=8080)
#
# Pick a specific browser with:  BROWSER=/path/to/browser ./start.sh

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"
MODE="kiosk"
PIDFILE="$DIR/.server.pid"
STOPFILE="$DIR/.shutdown"   # server.py leaves this when "Shut down" is pressed on the settings page
OS="$(uname -s)"

while [ $# -gt 0 ]; do
  case "$1" in
    --windowed)   MODE="windowed" ;;
    --no-browser) MODE="none" ;;
    --stop)       MODE="stop" ;;
    --port)       shift; PORT="${1:-8000}" ;;
    -h|--help)    sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
  shift
done

URL="http://localhost:$PORT/"

say() { printf '%s\n' "$*"; }

# ---------- python ----------
PY=""
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' 2>/dev/null; then
    PY="$p"; break
  fi
done
if [ -z "$PY" ]; then
  say "Python 3.7 or newer is required."
  case "$OS" in
    Darwin) say "Install it with: xcode-select --install   (or: brew install python)" ;;
    FreeBSD) say "Install it with: sudo pkg install python3" ;;
    OpenBSD) say "Install it with: doas pkg_add python3" ;;
    *) say "Install it with your package manager, e.g.: sudo apt install python3" ;;
  esac
  exit 1
fi

server_up() {
  "$PY" - "$PORT" <<'EOF' 2>/dev/null
import sys, urllib.request
try:
    urllib.request.urlopen("http://127.0.0.1:%s/api/info" % sys.argv[1], timeout=1)
except Exception:
    sys.exit(1)
EOF
}

stop_server() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && say "Server stopped."
    rm -f "$PIDFILE"
  else
    say "No server started by this script is running."
  fi
}

if [ "$MODE" = "stop" ]; then stop_server; exit 0; fi

# ---------- server ----------
STARTED_SERVER=0
if server_up; then
  say "Server already running on port $PORT."
else
  "$PY" "$DIR/server.py" --port "$PORT" >"$DIR/server.log" 2>&1 &
  echo $! >"$PIDFILE"
  STARTED_SERVER=1
  i=0
  until server_up; do
    i=$((i + 1))
    if [ $i -gt 40 ]; then say "The server did not start. See $DIR/server.log"; exit 1; fi
    sleep 0.25
  done
fi
"$PY" - "$PORT" <<'EOF'
import sys, json, urllib.request
info = json.load(urllib.request.urlopen("http://127.0.0.1:%s/api/info" % sys.argv[1]))
print("Monster Eye is running.")
for u in info.get("urls", []):
    print("  Settings from your phone: %s/config.html" % u)
EOF

if [ "$MODE" = "none" ]; then
  [ "$STARTED_SERVER" = 0 ] && { say "Open $URL in any browser."; exit 0; }
  say "Open $URL (or the address above) in any browser. Press Ctrl+C to stop."
  trap 'stop_server; exit 0' INT TERM
  wait
  rm -f "$PIDFILE"   # the server stopped by itself: shut down from the settings page
  exit 0
fi

# ---------- browser ----------
PROFILE="$HOME/.config/monster-eye-browser"
[ "$OS" = "Darwin" ] && PROFILE="$HOME/Library/Application Support/MonsterEye"
mkdir -p "$PROFILE"

BROWSER_CMD=()
KIND=""
find_browser() {
  if [ -n "${BROWSER:-}" ]; then
    BROWSER_CMD=("$BROWSER")
    case "$BROWSER" in *firefox*|*Firefox*) KIND=firefox ;; *) KIND=chromium ;; esac
    return 0
  fi
  if [ "$OS" = "Darwin" ]; then
    for app in "Google Chrome" "Chromium" "Brave Browser" "Microsoft Edge" "Vivaldi"; do
      for base in "/Applications" "$HOME/Applications"; do
        if [ -x "$base/$app.app/Contents/MacOS/$app" ]; then
          BROWSER_CMD=("$base/$app.app/Contents/MacOS/$app"); KIND=chromium; return 0
        fi
      done
    done
    for base in "/Applications" "$HOME/Applications"; do
      if [ -x "$base/Firefox.app/Contents/MacOS/firefox" ]; then
        BROWSER_CMD=("$base/Firefox.app/Contents/MacOS/firefox"); KIND=firefox; return 0
      fi
    done
    return 1
  fi
  for b in chromium chromium-browser google-chrome-stable google-chrome chrome brave-browser brave microsoft-edge-stable microsoft-edge vivaldi-stable vivaldi; do
    if command -v "$b" >/dev/null 2>&1; then BROWSER_CMD=("$b"); KIND=chromium; return 0; fi
  done
  if command -v flatpak >/dev/null 2>&1; then
    for app in org.chromium.Chromium com.google.Chrome com.brave.Browser; do
      if flatpak info "$app" >/dev/null 2>&1; then BROWSER_CMD=(flatpak run "$app"); KIND=chromium; return 0; fi
    done
  fi
  for b in firefox firefox-esr; do
    if command -v "$b" >/dev/null 2>&1; then BROWSER_CMD=("$b"); KIND=firefox; return 0; fi
  done
  return 1
}

if ! find_browser; then
  if [ "$OS" = "Darwin" ]; then
    say "No Chrome/Chromium/Brave/Edge/Firefox found; opening Safari. Press F (or Ctrl+Cmd+F) for full screen."
    open "$URL"
    exit 0
  fi
  say "No supported browser found. Install Chromium (recommended) or Firefox, e.g.:"
  say "  Debian/Ubuntu/Raspberry Pi OS: sudo apt install chromium"
  say "  Fedora: sudo dnf install chromium      Arch: sudo pacman -S chromium"
  say "  FreeBSD: sudo pkg install chromium     Or open $URL in any browser yourself."
  exit 1
fi

if [ "$KIND" = "chromium" ]; then
  ARGS=(--user-data-dir="$PROFILE" --no-first-run --noerrdialogs --disable-infobars
        --disable-session-crashed-bubble --disable-features=Translate
        --check-for-update-interval=31536000 --password-store=basic --autoplay-policy=no-user-gesture-required)
  if [ "$MODE" = "kiosk" ]; then ARGS+=(--kiosk "$URL"); else ARGS+=(--new-window --window-size=1280,760 "$URL"); fi
else
  PROFILE="$PROFILE-firefox"; mkdir -p "$PROFILE"
  ARGS=(--new-instance --profile "$PROFILE")
  [ "$MODE" = "kiosk" ] && ARGS+=(--kiosk)
  ARGS+=("$URL")
fi

# ---------- keep the screen awake while the eye is showing ----------
WRAP=()
case "$OS" in
  Darwin)
    command -v caffeinate >/dev/null 2>&1 && { caffeinate -d -i -w $$ & }
    ;;
  *)
    if [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then xset s off -dpms s noblank 2>/dev/null; fi
    if command -v systemd-inhibit >/dev/null 2>&1 && systemd-inhibit --what=idle --who=test --why=test true >/dev/null 2>&1; then
      WRAP=(systemd-inhibit --what=idle:sleep --who="Monster Eye" --why="Showing the eye" --mode=block)
    fi
    ;;
esac

# The process we launch may only be a wrapper (systemd-inhibit, flatpak), so signal what it started too.
kill_tree() {
  local kids k
  kids="$(pgrep -P "$2" 2>/dev/null)"
  kill "-$1" "$2" 2>/dev/null
  for k in $kids; do kill_tree "$1" "$k"; done
}
BROWSER_PID=""
close_browser() {
  [ -n "$BROWSER_PID" ] || return 0
  kill -0 "$BROWSER_PID" 2>/dev/null || return 0
  kill_tree TERM "$BROWSER_PID"
  local i=0
  while [ $i -lt 10 ]; do
    kill -0 "$BROWSER_PID" 2>/dev/null || return 0
    sleep 0.5; i=$((i + 1))
  done
  kill_tree KILL "$BROWSER_PID"
}

cleanup() { close_browser; [ "$STARTED_SERVER" = 1 ] && stop_server >/dev/null; }
trap cleanup EXIT
trap 'exit 0' INT TERM

say "Opening the eye in ${BROWSER_CMD[*]##*/} ($MODE). Close the browser (Alt+F4 / Cmd+Q) or press Shut down on the settings page to stop."
"${WRAP[@]+"${WRAP[@]}"}" "${BROWSER_CMD[@]}" "${ARGS[@]}" &
BROWSER_PID=$!
# Run until the browser is closed, or until the settings page asks for a shutdown.
while kill -0 "$BROWSER_PID" 2>/dev/null && [ ! -e "$STOPFILE" ]; do sleep 1; done
