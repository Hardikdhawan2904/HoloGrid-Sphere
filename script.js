'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video        = document.getElementById('webcam');
const overlayCanvas= document.getElementById('overlay');
const ctx          = overlayCanvas.getContext('2d');
const threeCanvas  = document.getElementById('threeCanvas');
const loadScreen   = document.getElementById('loadingScreen');
const loadFill     = document.getElementById('loadFill');
const loadMsg      = document.getElementById('loadMsg');
const $            = id => document.getElementById(id);

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  overlayCanvas.width  = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam3.aspect = window.innerWidth / window.innerHeight;
  cam3.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  lLM: null, rLM: null,
  // App state machine
  appMode: 'menu',          // 'menu' | 'globe' | 'energy'
  menuHover: [0, 0],        // hover fill progress per button (0→1)
  backHover: 0,             // back-button hover progress
  // Globe (between-hands mode)
  globeR: 0, targetR: 0.3, springVel: 0,
  globeAlpha: 0,
  globeX: 0.5, globeY: 0.5,
  openness: 0,              // 0=small, 1=large — driven by hand distance
  sqX: 1, sqY: 1,           // deformation squish factors
  globeAngle: 0,            // rotation angle aligned with hand axis
  prevGX: 0.5, prevGY: 0.5, // previous globe midpoint for velocity
  spinVY: 0.008, spinVX: 0.003, // angular momentum
  // Energy beams
  beamAlpha: 0, beamIntensity: 0,
  // FX
  shockwaves: [],
  fps: 0, _fN: 0, _fT: 0,
};

const lSmooth = { x: 0.3, y: 0.5 };
const rSmooth = { x: 0.7, y: 0.5 };
const LERP    = 0.18;

// ── Three.js ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
const cam3  = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
cam3.position.z = 5;

const renderer = new THREE.WebGLRenderer({
  canvas: threeCanvas, alpha: true, antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);

scene.add(new THREE.AmbientLight(0x004422, 1));
const ptLight = new THREE.PointLight(0x00ffcc, 5, 9);
scene.add(ptLight);

// Globe materials
const coreMat  = new THREE.MeshStandardMaterial({ color:0x001a0d, emissive:0x00ff44, emissiveIntensity:2.2, transparent:true, opacity:0, metalness:0.3, roughness:0.25 });
const innerMat = new THREE.MeshBasicMaterial({ color:0x00ff88, transparent:true, opacity:0, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false });
const glowMat  = new THREE.MeshBasicMaterial({ color:0x00aa44, transparent:true, opacity:0, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false });
const ringMat  = new THREE.MeshBasicMaterial({ color:0x00ffcc, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
const satMat   = new THREE.MeshBasicMaterial({ color:0x00ffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });

// Custom lat/lon grid globe (clean lines like a real globe)
function buildGlobeGrid() {
  const g = new THREE.Group();
  const mkMat = () => new THREE.LineBasicMaterial({
    color: 0x00ffbb, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const SEG = 80;
  // Latitude rings
  for (let i = 1; i <= 11; i++) {
    const phi = (i / 12) * Math.PI;
    const y = Math.cos(phi), r = Math.sin(phi);
    const pts = [];
    for (let j = 0; j <= SEG; j++) {
      const t = (j / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t)));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mkMat()));
  }
  // Longitude lines
  for (let i = 0; i < 18; i++) {
    const theta = (i / 18) * Math.PI * 2;
    const pts = [];
    for (let j = 0; j <= SEG; j++) {
      const phi = (j / SEG) * Math.PI;
      pts.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)
      ));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mkMat()));
  }
  return g;
}
const gridGlobe = buildGlobeGrid();
const coreGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.82, 28, 28), coreMat);
const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 20), innerMat);
const outerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.55, 20, 20), glowMat);

const rGeo  = new THREE.TorusGeometry(1.3, 0.011, 4, 56);
const ring1 = new THREE.Mesh(rGeo, ringMat.clone());
const ring2 = new THREE.Mesh(rGeo, ringMat.clone());
ring1.rotation.x = Math.PI / 3.5;
ring2.rotation.y = Math.PI / 2.8; ring2.rotation.z = Math.PI / 5;

const sGeo = new THREE.SphereGeometry(0.1, 7, 7);
const sats = [0,1,2].map(i => ({
  mesh : new THREE.Mesh(sGeo, satMat.clone()),
  phOff: i * Math.PI * 2 / 3,
  speed: 1.6 + i * 0.35,
  incl : (i+1) * Math.PI / 4,
}));

const globeGroup = new THREE.Group();
globeGroup.add(gridGlobe, coreGlobe, innerGlow, outerGlow, ring1, ring2,
               ...sats.map(s => s.mesh));
globeGroup.visible = false;
scene.add(globeGroup);

const OPC    = 80;
const opGeo  = new THREE.BufferGeometry();
const opArr  = new Float32Array(OPC * 3);
const opOrbs = Array.from({length:OPC}, () => ({
  r: 1.3 + Math.random()*0.5, incl: Math.random()*Math.PI,
  phase: Math.random()*Math.PI*2, speed: 0.016 + Math.random()*0.025,
}));
opOrbs.forEach((p,i) => {
  opArr[i*3]   = p.r * Math.cos(p.phase);
  opArr[i*3+1] = p.r * Math.sin(p.phase) * Math.cos(p.incl);
  opArr[i*3+2] = p.r * Math.sin(p.phase) * Math.sin(p.incl);
});
opGeo.setAttribute('position', new THREE.BufferAttribute(opArr, 3));
const opMat = new THREE.PointsMaterial({ color:0x00ffcc, size:0.055, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
const opSys = new THREE.Points(opGeo, opMat);
scene.add(opSys);

// ── Audio ─────────────────────────────────────────────────────────────────────
let aCtx = null;
function initAudio() { if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function playSelect() {
  initAudio();
  [[300,0],[480,.07],[720,.14]].forEach(([f,d]) => {
    const o=aCtx.createOscillator(), g=aCtx.createGain(), t=aCtx.currentTime+d;
    o.type='sine'; o.frequency.setValueAtTime(f,t); o.frequency.exponentialRampToValueAtTime(f*1.5,t+.18);
    g.gain.setValueAtTime(.07,t); g.gain.exponentialRampToValueAtTime(.001,t+.35);
    o.connect(g); g.connect(aCtx.destination); o.start(t); o.stop(t+.35);
  });
}
function playGlobeOn() {
  initAudio();
  const o=aCtx.createOscillator(), g=aCtx.createGain(), t=aCtx.currentTime;
  o.type='sine'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(380,t+.35);
  g.gain.setValueAtTime(.08,t); g.gain.exponentialRampToValueAtTime(.001,t+.55);
  o.connect(g); g.connect(aCtx.destination); o.start(t); o.stop(t+.55);
}
// ── MediaPipe ─────────────────────────────────────────────────────────────────
const hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands:2, modelComplexity:0, minDetectionConfidence:0.65, minTrackingConfidence:0.5 });
hands.onResults(res => {
  S.lLM = S.rLM = null;
  if (!res.multiHandLandmarks) return;
  res.multiHandLandmarks.forEach((lm,i) =>
    res.multiHandedness[i].label === 'Right' ? (S.lLM = lm) : (S.rLM = lm));
});

// ── Hand helpers ──────────────────────────────────────────────────────────────
function palmCtr(lm) {
  let x=0,y=0; [0,5,9,13,17].forEach(i=>{x+=lm[i].x;y+=lm[i].y;}); return {x:x/5,y:y/5};
}

// ── Coordinate helpers ────────────────────────────────────────────────────────
const toSC  = (x,y) => ({ sx:(1-x)*overlayCanvas.width, sy:y*overlayCanvas.height });
const _hH   = 2 * Math.tan(Math.PI/6) * 5;
const toW3  = (x,y) => ({ wx:(0.5-x)*_hH*(window.innerWidth/window.innerHeight), wy:(0.5-y)*_hH });

// ── Canvas: hand skeleton ─────────────────────────────────────────────────────
const HC   = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],
              [0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
const TIPS = new Set([4,8,12,16,20]);
const FTIPS= [4,8,12,16,20];

function drawSkeleton(lm, label, color) {
  ctx.save();
  ctx.strokeStyle=color; ctx.lineWidth=1.2; ctx.globalAlpha=0.75;
  ctx.beginPath();
  for (const [a,b] of HC) {
    const A=toSC(lm[a].x,lm[a].y), B=toSC(lm[b].x,lm[b].y);
    ctx.moveTo(A.sx,A.sy); ctx.lineTo(B.sx,B.sy);
  }
  ctx.stroke(); ctx.globalAlpha=1;
  ctx.fillStyle=color;
  ctx.beginPath();
  for (let i=0;i<21;i++) {
    if (TIPS.has(i)) continue;
    const {sx,sy}=toSC(lm[i].x,lm[i].y);
    ctx.moveTo(sx+2,sy); ctx.arc(sx,sy,2,0,Math.PI*2);
  }
  ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.beginPath();
  FTIPS.forEach(t=>{ const {sx,sy}=toSC(lm[t].x,lm[t].y); ctx.moveTo(sx+4,sy); ctx.arc(sx,sy,4,0,Math.PI*2); });
  ctx.fill();
  ctx.strokeStyle=color; ctx.lineWidth=1;
  ctx.beginPath();
  FTIPS.forEach(t=>{ const {sx,sy}=toSC(lm[t].x,lm[t].y); ctx.moveTo(sx+9,sy); ctx.arc(sx,sy,9,0,Math.PI*2); });
  ctx.stroke();
  const w=toSC(lm[0].x,lm[0].y); ctx.font='bold 11px "Courier New"'; ctx.fillStyle=color;
  ctx.fillText(label, w.sx+14, w.sy+18);
  ctx.restore();
}

// ── Canvas: energy beams ──────────────────────────────────────────────────────
function drawAllBeams(intensity) {
  ctx.save(); ctx.lineCap='round';
  const buildPaths = () => {
    FTIPS.forEach(tip => {
      const s1=toSC(S.lLM[tip].x,S.lLM[tip].y), s2=toSC(S.rLM[tip].x,S.rLM[tip].y);
      ctx.moveTo(s1.sx,s1.sy); ctx.lineTo(s2.sx,s2.sy);
    });
  };
  ctx.lineWidth=9;   ctx.globalAlpha=0.06*intensity; ctx.strokeStyle='#00ffff';
  ctx.beginPath(); buildPaths(); ctx.stroke();
  ctx.lineWidth=3;   ctx.globalAlpha=0.4*intensity;  ctx.strokeStyle='#00ffcc';
  ctx.beginPath(); buildPaths(); ctx.stroke();
  ctx.lineWidth=1.5; ctx.globalAlpha=0.95*intensity; ctx.strokeStyle='#ffffff';
  ctx.beginPath(); buildPaths(); ctx.stroke();
  ctx.lineCap='butt'; ctx.restore();
}
function drawTipRings(alpha) {
  if (!S.lLM || !S.rLM) return;
  ctx.save();
  const addRings = r => {
    for (const lm of [S.lLM,S.rLM])
      FTIPS.forEach(tip=>{ const {sx,sy}=toSC(lm[tip].x,lm[tip].y); ctx.moveTo(sx+r,sy); ctx.arc(sx,sy,r,0,Math.PI*2); });
  };
  ctx.lineWidth=6;   ctx.globalAlpha=0.08*alpha; ctx.strokeStyle='#00ffff';
  ctx.beginPath(); addRings(14); ctx.stroke();
  ctx.lineWidth=1.5; ctx.globalAlpha=0.85*alpha; ctx.strokeStyle='#00ffff';
  ctx.beginPath(); addRings(13); ctx.stroke();
  ctx.restore();
}

// ── Canvas: shockwaves ────────────────────────────────────────────────────────
function drawShockwaves() {
  S.shockwaves = S.shockwaves.filter(sw => sw.a > 0.01);
  if (!S.shockwaves.length) return;
  ctx.save(); ctx.strokeStyle='#00ffcc';
  for (const sw of S.shockwaves) {
    const {sx,sy}=toSC(sw.x,sw.y);
    ctx.lineWidth=2; ctx.globalAlpha=sw.a*0.5;
    ctx.beginPath(); ctx.arc(sx,sy,sw.r,0,Math.PI*2); ctx.stroke();
    sw.r+=7; sw.a-=0.038;
  }
  ctx.restore();
}

// ── Canvas: corner brackets ───────────────────────────────────────────────────
function drawBrackets() {
  const W=overlayCanvas.width,H=overlayCanvas.height,L=38,M=18;
  ctx.save(); ctx.strokeStyle='rgba(0,255,136,.65)'; ctx.lineWidth=2;
  ctx.beginPath();
  [[M,M,1,1],[W-M,M,-1,1],[M,H-M,1,-1],[W-M,H-M,-1,-1]].forEach(([ox,oy,dx,dy])=>{
    ctx.moveTo(ox+L*dx,oy); ctx.lineTo(ox,oy); ctx.lineTo(ox,oy+L*dy);
  });
  ctx.stroke(); ctx.restore();
}

// ── Canvas: MODE SELECTION MENU ──────────────────────────────────────────────
const MENU_BTNS = [
  { label:'◈ GLOBE MODE',   sub:'BOTH HANDS · DISTANCE = SIZE', col:'#00ff88' },
  { label:'⚡ ENERGY LINK', sub:'BOTH HANDS · FINGER BEAMS',    col:'#00ffcc' },
];
const HOVER_FRAMES = 75;  // ~1.25 s to select

function drawMenu() {
  const W = overlayCanvas.width, H = overlayCanvas.height;
  const R = Math.min(W * 0.14, 95);
  const btnX = [W * 0.28, W * 0.72];
  const btnY = H * 0.52;

  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Title
  ctx.font = `bold ${Math.min(22, W*0.04)}px "Courier New"`;
  ctx.fillStyle = '#00ff88'; ctx.globalAlpha = 0.9;
  ctx.fillText('◈ HoloHands AI', W/2, H*0.2);
  ctx.font = `${Math.min(11, W*0.022)}px "Courier New"`;
  ctx.fillStyle = '#00aa55'; ctx.globalAlpha = 0.7;
  ctx.fillText('HOVER YOUR HAND OVER A MODE TO SELECT', W/2, H*0.2 + Math.min(28, H*0.04));

  // Divider line
  ctx.strokeStyle = 'rgba(0,255,136,.2)'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(W*0.1, H*0.29); ctx.lineTo(W*0.9, H*0.29); ctx.stroke();

  MENU_BTNS.forEach((btn, i) => {
    const x = btnX[i], y = btnY;
    const prog = S.menuHover[i];

    // Outer pulse glow
    ctx.globalAlpha = 0.04 + prog * 0.12;
    ctx.fillStyle = btn.col;
    ctx.beginPath(); ctx.arc(x, y, R + 22, 0, Math.PI*2); ctx.fill();

    // Background fill
    ctx.globalAlpha = 0.06 + prog * 0.14;
    ctx.fillStyle = btn.col;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.fill();

    // Border ring
    ctx.globalAlpha = 0.35 + prog * 0.55;
    ctx.strokeStyle = btn.col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2); ctx.stroke();

    // Hover progress arc
    if (prog > 0.01) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = btn.col; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, R + 10, -Math.PI/2, -Math.PI/2 + prog * Math.PI*2);
      ctx.stroke(); ctx.lineCap = 'butt';
    }

    // Label text
    ctx.globalAlpha = 0.65 + prog * 0.35;
    ctx.fillStyle = btn.col;
    ctx.font = `bold ${Math.min(13, W*0.026) + prog*2}px "Courier New"`;
    ctx.fillText(btn.label, x, y - R*0.18);
    ctx.font = `${Math.min(9, W*0.018)}px "Courier New"`;
    ctx.fillStyle = '#008844';
    ctx.fillText(btn.sub, x, y + R*0.22);

    // Percent counter while hovering
    if (prog > 0.05) {
      ctx.globalAlpha = prog;
      ctx.fillStyle = btn.col;
      ctx.font = `bold ${Math.min(11, W*0.02)}px "Courier New"`;
      ctx.fillText(`${Math.round(prog*100)}%`, x, y + R*0.6);
    }
  });

  ctx.restore();
}

// ── Canvas: back-to-menu button ───────────────────────────────────────────────
const BACK_X = () => overlayCanvas.width  * 0.5;
const BACK_Y = () => overlayCanvas.height * 0.92;
const BACK_R = 32;
const BACK_FRAMES = 55;

function drawBackButton() {
  const x = BACK_X(), y = BACK_Y();
  const prog = S.backHover;
  const pulse = 0.55 + Math.sin(Date.now()*0.004)*0.2;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';

  // Hint label above the button
  ctx.globalAlpha = pulse * 0.7;
  ctx.fillStyle = '#00aa55';
  ctx.font = '9px "Courier New"';
  ctx.fillText('HOVER TO GO BACK', x, y - BACK_R - 10);

  // Background fill
  ctx.globalAlpha = 0.12 + prog * 0.55;
  ctx.fillStyle = '#00ff88';
  ctx.beginPath(); ctx.arc(x, y, BACK_R, 0, Math.PI*2); ctx.fill();

  // Border ring
  ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5;
  ctx.globalAlpha = pulse * 0.6 + prog * 0.4;
  ctx.beginPath(); ctx.arc(x, y, BACK_R, 0, Math.PI*2); ctx.stroke();

  // Progress arc
  if (prog > 0.01) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, BACK_R+7, -Math.PI/2, -Math.PI/2 + prog*Math.PI*2); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Label
  ctx.globalAlpha = 0.65 + prog*0.35;
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 10px "Courier New"';
  ctx.fillText('◈ MENU', x, y);
  ctx.restore();
}

// ── Canvas: hint when hands missing in active mode ────────────────────────────
function drawHint(text) {
  const W=overlayCanvas.width, H=overlayCanvas.height;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.globalAlpha=0.45;
  ctx.font=`${Math.min(13,W*0.025)}px "Courier New"`;
  ctx.fillStyle='#00ff88';
  ctx.fillText(text, W/2, H*0.82);
  ctx.restore();
}

// ── Canvas: reactive background particles ────────────────────────────────────
const bgP = Array.from({length:72}, () => ({
  x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight,
  vx:(Math.random()-.5)*0.4, vy:(Math.random()-.5)*0.4,
  r: Math.random()*1.4+0.5,
}));
function drawBgParticles() {
  const W=overlayCanvas.width, H=overlayCanvas.height;
  const REPEL=230;
  const pts=[];
  for (const lm of [S.lLM,S.rLM]) {
    if (!lm) continue;
    const pc=palmCtr(lm); pts.push(toSC(pc.x,pc.y));
    pts.push(toSC(lm[0].x,lm[0].y));
  }
  ctx.save();
  ctx.fillStyle='#00ff88'; ctx.globalAlpha=0.08;
  ctx.beginPath();
  for (const p of bgP) {
    for (const h of pts) {
      const dx=p.x-h.sx, dy=p.y-h.sy, dist=Math.hypot(dx,dy);
      if (dist<REPEL && dist>1) {
        const f=Math.pow((REPEL-dist)/REPEL,2)*5;
        p.vx+=(dx/dist)*f; p.vy+=(dy/dist)*f;
      }
    }
    p.vx*=0.92; p.vy*=0.92;
    const spd=Math.hypot(p.vx,p.vy); if(spd>6){p.vx*=6/spd;p.vy*=6/spd;}
    p.x=(p.x+p.vx+W)%W; p.y=(p.y+p.vy+H)%H;
    ctx.moveTo(p.x+p.r,p.y); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
  }
  ctx.fill();
  if (pts.length) {
    ctx.fillStyle='#00ffcc'; ctx.globalAlpha=0.5;
    ctx.beginPath();
    for (const p of bgP) {
      const nd=pts.reduce((mn,h)=>Math.min(mn,Math.hypot(p.x-h.sx,p.y-h.sy)),Infinity);
      if (nd<REPEL) { const gr=p.r*(1+(1-nd/REPEL)*2.5); ctx.moveTo(p.x+gr,p.y); ctx.arc(p.x,p.y,gr,0,Math.PI*2); }
    }
    ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.globalAlpha=0.7;
    ctx.beginPath();
    for (const p of bgP) {
      const nd=pts.reduce((mn,h)=>Math.min(mn,Math.hypot(p.x-h.sx,p.y-h.sy)),Infinity);
      if (nd<REPEL*0.35) { ctx.moveTo(p.x+p.r,p.y); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); }
    }
    ctx.fill();
  }
  ctx.restore();
}

// ── Three.js: globe update ────────────────────────────────────────────────────
function updateGlobe(ts) {
  const t=ts*0.001, a=S.globeAlpha;
  const k=0.38, d=0.14;
  S.springVel += -k*(S.globeR-S.targetR) - d*S.springVel;
  S.globeR     = Math.max(0, S.globeR+S.springVel);

  if (S.springVel>0.022 && a>0.55 && S.shockwaves.length<3)
    S.shockwaves.push({x:S.globeX,y:S.globeY,r:S.globeR*55+20,a:0.75});

  const r=S.globeR;
  const gridOp = a*(0.72+Math.sin(t*2.2)*0.12);
  gridGlobe.children.forEach(l => { l.material.opacity = gridOp; });
  coreMat.opacity  = a*0.78;
  innerMat.opacity = a*0.22;
  glowMat.opacity  = a*0.07;
  opMat.opacity    = a*0.9;
  globeGroup.visible = a>0.01;
  opSys.visible      = a>0.01;

  if (a>0.01) {
    // Deformation: align globe axis with hand-to-hand vector, squish in that direction
    if (S.lLM && S.rLM) {
      const angle = Math.atan2(lSmooth.y-rSmooth.y, rSmooth.x-lSmooth.x);
      S.globeAngle += (angle - S.globeAngle) * 0.1;
      const dist = Math.hypot(lSmooth.x-rSmooth.x, lSmooth.y-rSmooth.y);
      const tSqX = 1 + dist * 0.38;
      const tSqY = Math.max(0.65, 1 / tSqX * 0.88 + 0.12);
      S.sqX += (tSqX - S.sqX) * 0.1;
      S.sqY += (tSqY - S.sqY) * 0.1;
    } else {
      S.globeAngle *= 0.92;
      S.sqX += (1 - S.sqX) * 0.08;
      S.sqY += (1 - S.sqY) * 0.08;
    }
    globeGroup.rotation.z = S.globeAngle;

    // Hand-movement-driven rotation with momentum
    if (S.lLM && S.rLM) {
      const dX = S.globeX - S.prevGX;
      const dY = S.globeY - S.prevGY;
      S.spinVY += dX * 20;
      S.spinVX += dY * 14;
    }
    S.prevGX = S.globeX; S.prevGY = S.globeY;
    S.spinVY = S.spinVY * 0.93 + (0.007 - S.spinVY) * 0.012; // decay toward idle
    S.spinVX = S.spinVX * 0.93 + (0.002 - S.spinVX) * 0.012;
    gridGlobe.rotation.y += S.spinVY;
    gridGlobe.rotation.x += S.spinVX;

    // Grid deforms with squish; core/glow stay round for organic look
    gridGlobe.scale.set(r * S.sqX, r * S.sqY, r);

    coreGlobe.scale.setScalar(r*0.82);
    innerGlow.scale.setScalar(r*1.15);
    outerGlow.scale.setScalar(r*1.55);

    const ringScale=r*(1+S.openness*0.45), ringOp=a*(0.2+S.openness*0.6);
    ring1.scale.setScalar(ringScale); ring1.rotation.z+=0.018; ring1.material.opacity=ringOp;
    ring2.scale.setScalar(ringScale); ring2.rotation.x+=0.014; ring2.material.opacity=ringOp*0.75;

    const satVis=Math.max(0,(S.openness-0.25)/0.6);
    sats.forEach(sat=>{
      const phase=t*sat.speed+sat.phOff, oR=r*1.72;
      sat.mesh.position.set(Math.cos(phase)*oR, Math.sin(phase)*Math.cos(sat.incl)*oR, Math.sin(phase)*Math.sin(sat.incl)*oR);
      sat.mesh.scale.setScalar(r*0.14*(0.8+Math.sin(phase*3)*0.2));
      sat.mesh.material.opacity=a*satVis*(0.7+Math.sin(phase*2)*0.3);
    });

    if (opMat.opacity>0.05) {
      const speedMul=1+S.openness*0.9;
      opOrbs.forEach((p,i)=>{
        p.phase+=p.speed*speedMul;
        opArr[i*3]=p.r*Math.cos(p.phase);
        opArr[i*3+1]=p.r*Math.sin(p.phase)*Math.cos(p.incl);
        opArr[i*3+2]=p.r*Math.sin(p.phase)*Math.sin(p.incl);
      });
      opGeo.attributes.position.needsUpdate=true;
    }
    opSys.scale.setScalar(r); opSys.position.copy(globeGroup.position);

    const {wx,wy}=toW3(S.globeX,S.globeY);
    globeGroup.position.x+=(wx-globeGroup.position.x)*0.28;
    globeGroup.position.y+=(wy-globeGroup.position.y)*0.28;
    ptLight.position.set(globeGroup.position.x,globeGroup.position.y,2);

    coreMat.emissiveIntensity=2+S.openness*2.5+Math.sin(t*3)*0.3;
    coreMat.emissive.setHSL(0.38-S.openness*0.12,1,0.5);
  }
}

// ── DOM HUD update ────────────────────────────────────────────────────────────
let _hudTick=0;
const _hudCache={};
function setIC(id,txt,cls) {
  const key=id+txt+(cls||'');
  if(_hudCache[id]===key)return; _hudCache[id]=key;
  const e=$(id); if(!e)return; e.textContent=txt; e.className='stat-item'+(cls?' '+cls:'');
}
function updateHUD() {
  const fp=$('fpsCnt'); if(fp) fp.textContent=`FPS: ${S.fps}`;
  if(++_hudTick%4!==0) return;
  setIC('lhStat', S.lLM?'◉ LEFT HAND: ACTIVE':'◉ LEFT HAND: OFFLINE',  S.lLM?'active':'');
  setIC('rhStat', S.rLM?'◉ RIGHT HAND: ACTIVE':'◉ RIGHT HAND: OFFLINE', S.rLM?'active':'');
  const mL={menu:'SELECT MODE',globe:'GLOBE · BETWEEN HANDS',energy:'ENERGY LINK'};
  setIC('modeStat','◉ MODE: '+mL[S.appMode], S.appMode!=='menu'?'mode active':'mode');
  const hl=$('holoLabel'),el=$('linkLabel');
  if(hl) { const c='badge'+(S.appMode==='globe'?'':' hidden'); if(hl.className!==c)hl.className=c; }
  if(el) { const c='badge cyan'+(S.appMode==='energy'?'':' hidden'); if(el.className!==c)el.className=c; }
  const lp=$('lPalmDbg'),rp=$('rPalmDbg'),ld=$('linkDbg');
  const fmt=p=>p?`${(p.x*100).toFixed(0)},${(p.y*100).toFixed(0)}`:'---';
  if(lp) lp.textContent=S.lLM?fmt(palmCtr(S.lLM)):'---';
  if(rp) rp.textContent=S.rLM?fmt(palmCtr(S.rLM)):'---';
  if(ld) ld.textContent=S.appMode==='energy'?(S.beamIntensity*100).toFixed(0)+'%':'OFFLINE';
}

// ── Main animation loop ───────────────────────────────────────────────────────
let _prevGlobeSounded = false;
function animate(ts) {
  requestAnimationFrame(animate);
  S._fN++; if(ts-S._fT>=1000){S.fps=S._fN;S._fN=0;S._fT=ts;}

  // Smooth both hand positions whenever visible
  if(S.lLM){const c=palmCtr(S.lLM);lSmooth.x+=(c.x-lSmooth.x)*LERP;lSmooth.y+=(c.y-lSmooth.y)*LERP;}
  if(S.rLM){const c=palmCtr(S.rLM);rSmooth.x+=(c.x-rSmooth.x)*LERP;rSmooth.y+=(c.y-rSmooth.y)*LERP;}

  const W=overlayCanvas.width, H=overlayCanvas.height;

  // ── MENU STATE ─────────────────────────────────────────────────────────────
  if (S.appMode === 'menu') {
    const R    = Math.min(W*0.14, 95);
    const btnX = [W*0.28, W*0.72];
    const btnY = H*0.52;
    const handPts = [];
    if(S.lLM){const c=palmCtr(S.lLM);handPts.push(toSC(c.x,c.y));}
    if(S.rLM){const c=palmCtr(S.rLM);handPts.push(toSC(c.x,c.y));}

    MENU_BTNS.forEach((_,i) => {
      const hovering = handPts.some(p => Math.hypot(p.sx-btnX[i], p.sy-btnY) < R+22);
      if (hovering) {
        S.menuHover[i] = Math.min(1, S.menuHover[i] + 1/HOVER_FRAMES);
        if (S.menuHover[i] >= 1) {
          S.appMode   = i===0 ? 'globe' : 'energy';
          S.menuHover = [0, 0];
          _prevGlobeSounded = false;
          playSelect();
        }
      } else {
        S.menuHover[i] = Math.max(0, S.menuHover[i] - 1/35);
      }
    });

  // ── GLOBE MODE — single hand: above palm · both hands: between, dist=size ────
  } else if (S.appMode === 'globe') {
    const anyHand = S.lLM || S.rLM;
    if (anyHand) {
      if (!_prevGlobeSounded) { playGlobeOn(); _prevGlobeSounded=true; }
      if (S.lLM && S.rLM) {
        S.globeX = (lSmooth.x+rSmooth.x)/2;
        S.globeY = (lSmooth.y+rSmooth.y)/2;
        // Convert hand distance to world-space so globe radius = half the gap between hands
        const aspect = window.innerWidth / window.innerHeight;
        const dxW = (lSmooth.x - rSmooth.x) * _hH * aspect;
        const dyW = (lSmooth.y - rSmooth.y) * _hH;
        const worldDist = Math.hypot(dxW, dyW);
        S.targetR = Math.max(0.12, Math.min(2.8, worldDist * 0.5));
        if (S.springVel > 0.025 && S.shockwaves.length < 3)
          S.shockwaves.push({x:S.globeX,y:S.globeY,r:S.globeR*55+20,a:0.8});
      } else {
        // single hand: position globe above palm
        const sm = S.lLM ? lSmooth : rSmooth;
        const lm = S.lLM || S.rLM;
        const dx = lm[9].x-lm[0].x, dy = lm[9].y-lm[0].y;
        const len = Math.hypot(dx,dy)||0.01;
        S.globeX = sm.x+(dx/len)*0.13;
        S.globeY = sm.y+(dy/len)*0.13;
        S.targetR = 0.28;
      }
      S.openness   = Math.min(1, S.globeR/0.45);
      S.globeAlpha = Math.min(1, S.globeAlpha+0.06);
    } else {
      _prevGlobeSounded = false;
      S.globeAlpha = Math.max(0, S.globeAlpha-0.05);
      S.openness   = Math.max(0, S.openness-0.03);
    }

    // Back button
    const handPts=[];
    if(S.lLM){const c=palmCtr(S.lLM);handPts.push(toSC(c.x,c.y));}
    if(S.rLM){const c=palmCtr(S.rLM);handPts.push(toSC(c.x,c.y));}
    const backHovering = handPts.some(p=>Math.hypot(p.sx-BACK_X(),p.sy-BACK_Y())<BACK_R+18);
    S.backHover = backHovering
      ? Math.min(1, S.backHover+1/BACK_FRAMES)
      : Math.max(0, S.backHover-1/25);
    if (S.backHover>=1) { S.appMode='menu'; S.backHover=0; S.globeAlpha=0; S.globeR=0; playSelect(); }

  // ── ENERGY MODE ────────────────────────────────────────────────────────────
  } else if (S.appMode === 'energy') {
    if (S.lLM && S.rLM) {
      const dist=Math.hypot(lSmooth.x-rSmooth.x, lSmooth.y-rSmooth.y);
      S.beamIntensity=Math.max(0.25,Math.min(1,1.2-dist*1.5));
      S.beamAlpha=Math.min(1, S.beamAlpha+0.055);
    } else if (S.lLM || S.rLM) {
      S.beamIntensity=0.45;
      S.beamAlpha=Math.min(0.5, S.beamAlpha+0.04);  // partial glow with one hand
    } else {
      S.beamAlpha=Math.max(0, S.beamAlpha-0.055);
    }

    // Back button
    const handPts=[];
    if(S.lLM){const c=palmCtr(S.lLM);handPts.push(toSC(c.x,c.y));}
    if(S.rLM){const c=palmCtr(S.rLM);handPts.push(toSC(c.x,c.y));}
    const backHovering=handPts.some(p=>Math.hypot(p.sx-BACK_X(),p.sy-BACK_Y())<BACK_R+18);
    S.backHover=backHovering
      ? Math.min(1,S.backHover+1/BACK_FRAMES)
      : Math.max(0,S.backHover-1/25);
    if (S.backHover>=1) { S.appMode='menu'; S.backHover=0; S.beamAlpha=0; playSelect(); }
  }

  // ── 2D canvas ─────────────────────────────────────────────────────────────
  ctx.clearRect(0,0,W,H);
  drawBgParticles();
  drawBrackets();
  drawShockwaves();

  if (S.lLM) drawSkeleton(S.lLM,'◈ LEFT HAND', '#00ff88');
  if (S.rLM) drawSkeleton(S.rLM,'◈ RIGHT HAND','#00ffcc');

  if (S.appMode==='menu') {
    drawMenu();
  } else if (S.appMode==='globe') {
    if (!S.lLM && !S.rLM) drawHint('BRING HANDS INTO VIEW');
    else if (!S.lLM || !S.rLM) drawHint('ADD SECOND HAND · DISTANCE CONTROLS SIZE');
    drawBackButton();
  } else if (S.appMode==='energy') {
    if (!S.lLM && !S.rLM) drawHint('BRING HANDS INTO VIEW');
    else if (!S.lLM || !S.rLM) drawHint('ADD SECOND HAND FOR ENERGY BEAMS');
    if (S.beamAlpha>0.01) {
      ctx.save(); ctx.globalAlpha=S.beamAlpha;
      drawTipRings(S.beamIntensity);
      if (S.lLM && S.rLM) drawAllBeams(S.beamIntensity);
      ctx.restore();
    }
    drawBackButton();
  }

  // ── Three.js ──────────────────────────────────────────────────────────────
  if (S.appMode!=='energy') updateGlobe(ts);
  else { globeGroup.visible=false; opSys.visible=false; }
  renderer.render(scene,cam3);
  updateHUD();
}

// ── Startup ───────────────────────────────────────────────────────────────────
const mpCam = new Camera(video, {
  onFrame: async () => { await hands.send({image:video}); },
  width:640, height:480, facingMode:'user',
});

let prog=0;
const pt=setInterval(()=>{prog=Math.min(prog+6,92);if(loadFill)loadFill.style.width=prog+'%';if(prog>=92)clearInterval(pt);},120);

resize();
mpCam.start()
  .then(()=>{
    clearInterval(pt);
    if(loadFill) loadFill.style.width='100%';
    if(loadMsg)  loadMsg.textContent='✓ SYSTEMS ONLINE';
    setTimeout(()=>{
      if(loadScreen){loadScreen.style.opacity='0';setTimeout(()=>{loadScreen.style.display='none';},700);}
      requestAnimationFrame(animate);
    },600);
  })
  .catch(()=>{
    if($('loadTitle')) $('loadTitle').textContent='✗ CAMERA ACCESS DENIED';
    const isMobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const isHTTPS=location.protocol==='https:';
    if(loadMsg) loadMsg.textContent = isMobile&&!isHTTPS
      ? 'Mobile requires HTTPS. Use https:// in the URL.'
      : isMobile
        ? 'Tap the lock icon → allow camera, then refresh.'
        : 'Click the camera icon in the address bar → allow, then refresh.';
  });

document.addEventListener('pointerdown',initAudio,{once:true});
