#!/usr/bin/env bash
# Start the Monster Eye automatically when you log in.
#   ./install-autostart.sh            install (Linux/BSD desktops, Raspberry Pi, macOS)
#   ./install-autostart.sh --remove   uninstall
# Extra start.sh options can follow, e.g.:  ./install-autostart.sh --port 8080
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$DIR/start.sh" "$DIR/server.py"
BASH_BIN="$(command -v bash)"
REMOVE=0; EXTRA=()
for a in "$@"; do [ "$a" = "--remove" ] && REMOVE=1 || EXTRA+=("$a"); done

if [ "$(uname -s)" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.monstereye.start.plist"
  if [ $REMOVE = 1 ]; then
    launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "Removed."; exit 0
  fi
  mkdir -p "$HOME/Library/LaunchAgents"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo '  <key>Label</key><string>com.monstereye.start</string>'
    echo '  <key>ProgramArguments</key><array>'
    echo "    <string>$BASH_BIN</string><string>$DIR/start.sh</string>"
    for a in "${EXTRA[@]+"${EXTRA[@]}"}"; do echo "    <string>$a</string>"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/>'
    echo "  <key>StandardOutPath</key><string>$DIR/autostart.log</string>"
    echo "  <key>StandardErrorPath</key><string>$DIR/autostart.log</string>"
    echo '</dict></plist>'
  } >"$PLIST"
  launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"
  echo "Installed: the eye will open every time you log in."
  echo "Tip: System Settings > Lock Screen: set 'Turn display off' to Never while it's on display."
  exit 0
fi

# Linux / BSD: XDG autostart (GNOME, KDE, XFCE, Cinnamon, MATE, LXDE/LXQt, Raspberry Pi OS)
DESK="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/monster-eye.desktop"
if [ $REMOVE = 1 ]; then rm -f "$DESK"; echo "Removed."; exit 0; fi
mkdir -p "$(dirname "$DESK")"
cat >"$DESK" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Monster Eye
Comment=Halloween window eye
Exec=$BASH_BIN "$DIR/start.sh" ${EXTRA[@]+"${EXTRA[@]}"}
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
DESKTOP
echo "Installed: the eye will open when you log in to the desktop."
echo "Make sure the desktop logs in automatically and the screen never blanks (see README)."
