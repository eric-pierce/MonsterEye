# Monster Eye

A giant animated eye for a Halloween window display. It has 17 eye types (8 realistic, 9 stylized) and 30 animations.
A settings page, on the display computer or your phone, lets you choose the eye and which animations play in the loop.

It runs on any Unix-like system with a desktop: **Raspberry Pi OS, Ubuntu/Debian, Fedora, Arch and other Linux distros, macOS, and FreeBSD/OpenBSD**.

## Requirements

- **Python 3.7+.** It comes with macOS and most Linux distros. Only the standard library is used, so there's nothing to `pip install`.
- **A browser:** Chromium, Google Chrome, Brave, Edge or Vivaldi (recommended), or Firefox. On a Mac without these, it falls back to Safari.

## Files

| File | What it is |
|---|---|
| `index.html` | The eye (full-screen display) |
| `config.html` | Settings page with a live preview |
| `monster-eye.js` | The drawing engine, eye types and animations |
| `server.py` | Tiny server that stores settings so your phone can change them |
| `start.sh` | Starts the server and opens the eye full-screen in the best browser it finds |
| `install-autostart.sh` | Makes the eye launch automatically when you log in |

## Quick start

```bash
cd monster-eye
chmod +x start.sh install-autostart.sh
./start.sh
```

The terminal prints the address for your phone, for example `http://192.168.1.50:8000/config.html`.
To quit full screen, close the browser (**Alt+F4** on Linux, **Cmd+Q** on macOS). The server stops with it.
With no keyboard on the display, press **Shut down the eye** at the bottom of the settings page instead.

### Launcher options

| Command | What it does |
|---|---|
| `./start.sh` | Full-screen kiosk mode |
| `./start.sh --windowed` | Normal window, handy for trying it out on a laptop |
| `./start.sh --no-browser` | Server only; open the eye from any other device on your network |
| `./start.sh --port 8080` | Use another port (or `PORT=8080 ./start.sh`) |
| `./start.sh --stop` | Stop a server that's still running in the background |
| `BROWSER=/path/to/browser ./start.sh` | Force a specific browser |

No launcher at all? Run `python3 server.py` and open `http://localhost:8000/` in any browser, then press **F** for full screen.

## Start automatically at login

```bash
./install-autostart.sh            # install
./install-autostart.sh --remove   # uninstall
```

- **Linux/BSD** (GNOME, KDE, XFCE, Cinnamon, MATE, LXDE/LXQt, Raspberry Pi OS): adds a standard desktop autostart entry.
- **macOS:** adds a LaunchAgent that opens the eye each time you log in.

Autostart only launches the eye at login; nothing restarts it afterwards. So **Shut down the eye** on the settings page
also works on an autostarted eye, and it stays off until the next login or reboot (or until you run `./start.sh`).
To stop it coming back at all, run `./install-autostart.sh --remove`.

For an unattended display, also turn on automatic login and stop the screen from blanking:

| System | Keep the screen on |
|---|---|
| Raspberry Pi OS | `sudo raspi-config` → Display Options → Screen Blanking → No |
| GNOME (Ubuntu, Fedora…) | `gsettings set org.gnome.desktop.session idle-delay 0` |
| KDE | System Settings → Power Management → turn off screen dimming/off |
| XFCE / other X11 | `start.sh` already runs `xset s off -dpms` |
| macOS | `start.sh` keeps the display awake with `caffeinate` while the eye is open |

On systemd-based Linux, `start.sh` also holds an idle inhibitor while the browser is open.

## Controls on the eye screen (with a keyboard)

| Key | Action |
|---|---|
| `C` or double-click | Open settings |
| `N` / → | Skip to the next animation |
| `T` | Try the next eye type (until settings change) |
| `Space` | Hold: keep looping the current animation (press again to resume) |
| `1`–`9` | Jump to one of the first nine animations |
| `F` | Toggle fullscreen (if not in kiosk mode) |

## Settings

Open `http://<computer-address>:8000/config.html` from any phone or laptop on the same Wi-Fi, or press `C` on the display.
Changes save automatically, and the eye picks them up within about 2 seconds.

- **Eye type:** pick a creature, or rotate through all types, only the realistic ones, or only the stylized ones. The swap happens mid-blink.
- **Animation loop:** check or uncheck animations, set how many seconds each runs, and press **Play** to trigger one right away.
- **Playback:** shuffle or in-order, blink between animations.
- **Look:** iris color (with presets), saturation, skin tint, eye size, veins, lashes.
- **Shut down:** closes the eye's browser on the display and stops the server. The settings page goes offline with it,
  so starting again has to happen at the display computer. If you started only `python3 server.py` yourself, it stops the server and leaves your browser open.
- **Performance:** if animation stutters (older Pis or very old laptops), lower **Render resolution** to 60–70%, then lower the frame rate cap.

## Eye types

**Realistic**

| Type | Look |
|---|---|
| Realistic Human | Detailed human eye: textured iris, brow, fine lashes, tear duct, wet lid line |
| Hollow Corpse | Dead human eye: grey waxy skin, sunken bruised socket, bloodshot white, faded iris |
| Wolf | Amber eye with a black lid margin, set in grey fur with a dark facial mask |
| Goat | Pale gold iris with a horizontal bar pupil in short tan fur |
| Octopus | Bar pupil and golden-bronze iris in wet, mottled, pigment-speckled skin |
| Black Cat | Green-gold iris with a vertical slit pupil in sleek black fur |
| Vampire | Porcelain skin, shadowed socket, dark lashes, glowing blood-red iris |
| Creepy Clown | Cracked white greasepaint, a blue diamond painted through the eye, sickly yellow iris |

**Stylized**

| Type | Look |
|---|---|
| Classic Monster | Toxic green iris, veiny eyeball, warty purple hide, spiky lashes |
| Dragon | Giant golden reptile iris with a slit pupil, armored scales, spiked brow ridge |
| Demon | Black sclera, burning ember iris, charred skin with glowing lava cracks |
| Zombie | Milky clouded eye, yellowed bloodshot white, rotting stitched flesh |
| Cyborg | Camera-aperture pupil, spinning LED ring, riveted steel face |
| Mummy | Dry amber eye glaring through a gap in dusty, fraying linen wrappings |
| Jack-o'-Lantern | An eye carved into a pumpkin, lit from inside by a flickering candle |
| Giant Spider | A cluster of glossy black-red eyes in bristling hair; the big one looks around |
| Alien | Huge dark eye in smooth grey skin with a slowly turning galaxy for an iris |

Picking a type sets its natural colors, which you can then adjust (a brown or green iris on the human eye works well).
Every animation works with every type.

## Animations

Lurking Gaze · Watching You · Blink Frenzy · Pupil Pulse · Crazy Spin · Serpent Shift ·
Bloodshot Rage · Hypnotic Spiral · Color Chaos · Nervous Twitch · Sleepy... BOO! (jump scare) ·
Glitch Possession · Pupil Swarm · Heartbeat · Possessed Roll-Back · Lightning Storm · Blood Tears ·
Fly Chase · Spider Drop · Let Me Out (cracks the window) · Jack-o'-Lantern · Death's Reflection · Third Eyelid ·
Target Lock · Monster Mash · Blood Moon Eclipse · Bad Dream · Unimpressed (eye-roll) · Peekaboo · Lake Pride

For the most convincing realistic eyes, turn off the obviously supernatural animations (Color Chaos, Hypnotic Spiral, Pupil Swarm, Glitch,
Jack-o'-Lantern, Death's Reflection, Target Lock, Monster Mash, Lake Pride) and keep the natural ones:
Lurking Gaze, Watching You, Pupil Pulse, Nervous Twitch, Sleepy... BOO!, Blood Tears, Fly Chase, Spider Drop, Bad Dream, Unimpressed and Peekaboo.

**Lake Pride** is for the home crowd in Nonantum: the pupil reshapes into a shield, green, white and red pour in,
and it becomes the crest of The Lake while the iris glows through the flag colors. The crest then lifts out of the eye, fills the window for a couple of seconds and sinks back in. Uncheck it on the settings page if you display the eye somewhere else.

Good crowd-pleasers for trick-or-treaters: Fly Chase, Spider Drop, Peekaboo, Monster Mash and Let Me Out.

## Window display tips

- Turn the monitor's brightness all the way up. For an eerier look, tape thin white fabric or frosted window film over the glass so the screen edges disappear.
- Black out the rest of the window around the monitor with black paper or foam board.
- A Raspberry Pi 4/5 or any laptop from the last decade runs everything smoothly at 1080p. A Pi 3 is fine at about 60% render resolution.
- The first time each eye type appears, its skin is generated in a fraction of a second while the eye is blinking. The ten most recent skins stay cached, so memory use stays flat however many types you rotate through.

## Adding your own animation or eye type

Every animation is one object in the `ANIMS` list in `monster-eye.js`, and every eye type is one entry in `EYE_TYPES`.
Each frame, an animation's `fn(a)` sets targets such as
`a.tgt.lookX`, `a.tgt.pupil`, `a.tgt.lid`, `a.tgt.blood`, `a.tgt.hue`, `a.tgt.shake`, `a.tgt.slit`, `a.tgt.spiral`.
The engine eases smoothly toward those targets. Props are just as short: `a.ctl.critter = { kind: 'fly', x, y }` puts a fly (or `'spider'`) in front of the eye,
`a.crack(x, y, size)` cracks the glass, and `a.ctl.glyph = 'pumpkin'` with `a.tgt.glyph = 1` lights a face in the pupil. Copy an existing entry to start, and it appears on the settings page automatically.
