<div align="center">

```
  ◈ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◈
  
   ██╗  ██╗ ██████╗ ██╗      ██████╗     ██╗  ██╗ █████╗ ███╗   ██╗██████╗ ███████╗
   ██║  ██║██╔═══██╗██║     ██╔═══██╗    ██║  ██║██╔══██╗████╗  ██║██╔══██╗██╔════╝
   ███████║██║   ██║██║     ██║   ██║    ███████║███████║██╔██╗ ██║██║  ██║███████╗
   ██╔══██║██║   ██║██║     ██║   ██║    ██╔══██║██╔══██║██║╚██╗██║██║  ██║╚════██║
   ██║  ██║╚██████╔╝███████╗╚██████╔╝    ██║  ██║██║  ██║██║ ╚████║██████╔╝███████║
   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝
   
                  A  I   ◈   R E A L - T I M E   G E S T U R E   I N T E R F A C E
   
  ◈ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◈
```

<br/>

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0097A7?style=for-the-badge&logo=google&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00ff88?style=for-the-badge)

**Control a holographic 3D interface with nothing but your bare hands.**  
No controllers. No installs. Just open a browser, allow camera, and step into the future.

[▶ Quick Start](#-quick-start) · [✋ Gestures](#-gesture-guide) · [✨ Features](#-features) · [📱 Mobile](#-mobile-support)

</div>

---

## ✨ Features

### 🌐 Globe Mode
> *Your hands become the universe.*

- A **lat/lon wireframe globe** materializes exactly between both hands in 3D space
- **Distance = Size** — spread your hands apart and the globe expands to fill the gap; bring them together and it shrinks to a point
- **Movement = Rotation** — swipe your hands and the globe spins with momentum, coasting to a slow idle drift
- **Deformation** — the grid stretches and squishes to match the orientation of your hands
- Inner glow, orbiting rings, satellite spheres, and 80-point particle field all scale with globe size
- **Spring physics** — the globe bounces, overshoots, and settles with satisfying weight
- Shockwave ripples burst out on fast expansions

### ⚡ Energy Link Mode
> *Connect your fingertips with raw energy.*

- Glowing beams arc between every matching fingertip pair across both hands
- Beam intensity scales with how close your hands are — bring them together for full power
- Cyan tip rings pulse on all 10 fingertips
- Multi-layer rendering: wide outer glow + sharp inner beam + bright white core

### 🎛️ Holographic HUD
- Real-time hand status, active mode, palm coordinates, beam intensity
- FPS counter + signal strength display
- Corner brackets, animated scan sweep, mode badges
- Cinematic loading screen with progress bar

### 🎵 Synthesized Audio
- All sounds generated live with the Web Audio API — **no audio files**
- Mode selection chime, globe activation tone, energy link chord
- Purely synthetic; works fully offline after first load

### ✴️ Reactive Background
- **72 physics particles** scatter and repel away from your hands
- 3-pass rendering: dim base layer → cyan glow near hands → white sparks at close range
- The whole background reacts to your presence

---

## 🚀 Quick Start

### Option 1 — Python (recommended for mobile support)

```bash
git clone https://github.com/yourusername/holohands-ai
cd holohands-ai
python main.py
```

```
  Desktop : https://localhost:5000
  Mobile  : https://192.168.x.x:5000
```

> The server auto-generates a self-signed SSL certificate on first run.  
> On first visit, click **Advanced → Proceed** to accept it.

### Option 2 — Any static server

```bash
npx serve .
# or
npx http-server . -p 5000
```

### Option 3 — Direct file

Double-click `index.html`. *(Some browsers block camera on `file://` — use a server if it doesn't start.)*

---

## ✋ Gesture Guide

### Selecting a Mode

When the app launches you'll see two circular buttons on screen.  
**Hover your hand over a button and hold** — a progress arc fills over ~1 second. Release to activate.

| Button | Mode |
|--------|------|
| **◈ GLOBE MODE** | Holographic globe between hands |
| **⚡ ENERGY LINK** | Fingertip energy beams |

### Globe Mode Controls

| Gesture | Effect |
|---------|--------|
| Show one hand | Globe appears above your palm |
| Bring both hands into view | Globe snaps between them |
| Move hands apart | Globe grows |
| Bring hands together | Globe shrinks |
| Sweep hands sideways | Globe spins (with momentum) |
| Sweep hands up/down | Globe tilts |
| Angle hands diagonally | Globe deforms to match orientation |

### Energy Link Controls

| Gesture | Effect |
|---------|--------|
| Show both hands | Beams activate between all fingertips |
| Move hands closer | Beam intensity increases |
| Move hands apart | Beams fade |

### Returning to Menu

A **◈ MENU** button pulses at the bottom-center of the screen.  
Hover your hand over it and hold for ~1 second to go back.

---

## 📱 Mobile Support

HoloHands AI runs on mobile browsers (Chrome on Android, Safari on iOS).

Mobile browsers require **HTTPS** to access the camera. `main.py` handles this automatically:

1. Run `python main.py` on your computer
2. Open the **Mobile URL** printed in the terminal on your phone (must be on same Wi-Fi)
3. Tap **Advanced → Proceed to site**
4. Allow camera access when prompted
5. Use your phone like a holographic mirror ✨

> SSL certificates are auto-generated locally using Python's `cryptography` package.  
> Nothing is sent to any server — the cert never leaves your machine.

---

## 🛠 Tech Stack

| Technology | Role |
|-----------|------|
| **MediaPipe Hands** | Real-time 21-landmark hand tracking at up to 30 fps |
| **Three.js r128** | 3D globe, geometry, spring physics, particle system |
| **Canvas 2D** | Hand skeleton overlay, HUD, beams, shockwaves |
| **Web Audio API** | Fully synthesized sound effects — no audio files |
| **Python stdlib** | HTTPS static file server with auto self-signed cert |

Zero npm. Zero webpack. Zero backend. Pure browser technology.

---

## 📁 Project Structure

```
holohands-ai/
├── index.html        ← App shell, HUD markup, canvas elements
├── style.css         ← HUD panels, loading screen, mobile responsive
├── script.js         ← Everything: Three.js, MediaPipe, physics, audio
├── main.py           ← HTTPS static server with auto SSL cert
└── requirements.txt  ← Python: cryptography (auto-installed if missing)
```

---

## 🌐 Browser Requirements

| Browser | Support |
|---------|---------|
| Chrome 90+ | ✅ Full support |
| Edge 90+ | ✅ Full support |
| Firefox | ⚠️ MediaPipe may have issues |
| Safari (iOS 16+) | ✅ Works over HTTPS |
| Android Chrome | ✅ Works over HTTPS |

**Requires:** Webcam · WebGL · Internet connection *(first load only, for CDN scripts)*

---

## 📜 License

MIT — do whatever you want with it.

---

<div align="center">

**Built with raw browser APIs and a love for sci-fi interfaces.**

*No frameworks were harmed in the making of this project.*

</div>
