/* Cyber Kumho Archive — gallery walk (three.js r128) */
(function () {
  "use strict";
  const DATA = window.ARCHIVE_DATA;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PAL = {
    bg: 0x111211, wall: 0x23241f, wallLow: 0x1d1e1a, floor: 0x191815, ceil: 0x121310,
    mould: 0x3d3a31, base: 0x5a5140, frameOut: 0x0b0c0a, brass: 0x9d875e, frameIn: 0x1c1c18,
    mat: 0xe6dcc6, lamp: 0x6d5d42,
  };
  const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';
  const SERIF = '"Noto Serif KR", "Nanum Myeongjo", Georgia, serif';
  const $ = (id) => document.getElementById(id);

  /* ---------- renderer ---------- */
  const canvas = $("stage");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  scene.background = C(PAL.bg);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 160);
  const ANISO = renderer.capabilities.getMaxAnisotropy();
  const basic = (hex, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: C(hex) }, extra || {}));
  const M = {
    wall: basic(PAL.wall), wallLow: basic(PAL.wallLow), floor: basic(PAL.floor), ceil: basic(PAL.ceil),
    mould: basic(PAL.mould), base: basic(PAL.base), frameOut: basic(PAL.frameOut), brass: basic(PAL.brass),
    frameIn: basic(PAL.frameIn), mat: basic(PAL.mat), lamp: basic(PAL.lamp),
  };

  const texLoader = new THREE.TextureLoader();
  const texCache = {};
  function loadTex(url) {
    if (texCache[url]) return texCache[url];
    texCache[url] = new Promise((res, rej) =>
      texLoader.load(url, (t) => { t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO; res(t); }, undefined, rej));
    return texCache[url];
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO;
    return t;
  }
  function wrapLines(g, text, maxW) {
    const out = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const ch of para) {
        const t = line + ch;
        if (g.measureText(t).width > maxW && line) { out.push(line); line = ch === " " ? "" : ch; }
        else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function uvPlane(w, h, u, v, du, dv) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * du, v + uv.getY(i) * dv);
    return geo;
  }

  /* soft light textures */
  const spotTex = canvasTex(256, 512, (g) => {
    const gr = g.createRadialGradient(128, 40, 4, 128, 190, 330);
    gr.addColorStop(0, "rgba(255,226,170,.26)");
    gr.addColorStop(0.5, "rgba(240,205,140,.09)");
    gr.addColorStop(1, "rgba(230,190,120,0)");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(104, 0); g.lineTo(0, 512); g.lineTo(256, 512); g.lineTo(152, 0); g.closePath(); g.fill();
  });
  const poolTex = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, 0, 2, w / 2, 0, w * 0.5);
    gr.addColorStop(0, "rgba(255,222,165,.10)");
    gr.addColorStop(1, "rgba(255,222,165,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const spotMat = new THREE.MeshBasicMaterial({ map: spotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  /* ---------- wall labels (packed into tall canvases) ---------- */
  function buildLabels(items) {
    const CW = 1024, CH = 150, ROWS = 26, texes = [];
    for (let a = 0; a < items.length; a += ROWS) {
      texes.push(canvasTex(CW, CH * ROWS, (g) => {
        g.textAlign = "center"; g.textBaseline = "alphabetic";
        for (let j = 0; j < ROWS && a + j < items.length; j++) {
          const it = items[a + j], y = j * CH;
          g.fillStyle = "#e3d7bf"; g.font = `400 54px ${FONT}`;
          let t = it.title;
          while (g.measureText(t).width > CW - 40 && t.length > 4) t = t.slice(0, -2);
          if (t !== it.title) t += "…";
          g.fillText(t, CW / 2, y + 66);
          g.fillStyle = "#a79a82"; g.font = `400 34px ${FONT}`;
          g.fillText(`${it.year}   ·   ${String(it.src).replace(/[『』]/g, "")}`, CW / 2, y + 122);
        }
      }));
    }
    const mats = texes.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    return (i) => ({ mat: mats[Math.floor(i / ROWS)], v: 1 - ((i % ROWS) + 1) / ROWS, dv: 1 / ROWS });
  }

  /* ---------- wall text panel ---------- */
  function panelMesh(p, widthM) {
    const W = 1200, pad = 44;
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = `300 40px ${FONT}`;
    const lines = wrapLines(probe, p.text || "", W - pad * 2 - 10);
    const top = p.sub ? 380 : 320;
    const H = Math.max(640, top + lines.length * 64 + 40);
    const tex = canvasTex(W, H, (g, w) => {
      g.clearRect(0, 0, w, H);
      g.fillStyle = "#bda477"; g.fillRect(0, 56, 5, 120);
      g.textAlign = "left";
      g.fillStyle = "#d3bb8c"; g.font = `500 32px ${FONT}`;
      g.fillText(p.kicker, pad, 92);
      g.fillStyle = "#eee7db";
      let fs = p.big ? 100 : 84;
      g.font = `400 ${fs}px ${SERIF}`;
      while (g.measureText(p.title).width > w - pad * 2 && fs > 40) { fs -= 4; g.font = `400 ${fs}px ${SERIF}`; }
      g.fillText(p.title, pad - 4, 214);
      if (p.sub) { g.fillStyle = "#b6ad9e"; let ss = 40; g.font = `300 ${ss}px ${FONT}`; while (g.measureText(p.sub).width > w - pad * 2 && ss > 24) { ss -= 2; g.font = `300 ${ss}px ${FONT}`; } g.fillText(p.sub, pad, 286); }
      g.fillStyle = "#d9cfbf"; g.font = `300 40px ${FONT}`;
      let y = top;
      for (const ln of lines) { g.fillText(ln, pad, y); y += 64; }
    });
    const hM = widthM * (H / W);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.userData.h = hM;
    return mesh;
  }

  /* ---------- illustrated doorway ---------- */
  function doorTexture(h, i, label, leaves) {
    const W = 900, H = 1240;
    let preview = null;
    const draw = (g) => {
      g.clearRect(0, 0, W, H);
      // plaque
      g.fillStyle = "#171814"; g.fillRect(150, 0, 600, 150);
      g.strokeStyle = "#71634c"; g.lineWidth = 3; g.strokeRect(151.5, 1.5, 597, 147);
      g.textAlign = "center";
      g.fillStyle = "#d3bb8c"; g.font = `500 28px ${FONT}`;
      g.fillText(label.kicker, W / 2, 52);
      g.fillStyle = "#eee7db"; g.font = `400 54px ${SERIF}`;
      g.fillText(label.title, W / 2, 118);
      // architrave
      g.fillStyle = "#34312a"; g.fillRect(40, 180, 820, 1060);
      g.fillStyle = "#4a4436"; g.fillRect(40, 180, 820, 10);
      g.fillStyle = "#2a2822"; g.fillRect(70, 210, 760, 1030);
      // opening
      const ox = 100, oy = 240, ow = 700, oh = 1000;
      g.save(); g.beginPath(); g.rect(ox, oy, ow, oh); g.clip();
      const bx = 270, by = 430, bw = 360, bh = 470; // back wall
      g.fillStyle = "#15150f"; g.fillRect(ox, oy, ow, oh);
      // ceiling
      g.fillStyle = "#1b1a16";
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ow, oy); g.lineTo(bx + bw, by); g.lineTo(bx, by); g.closePath(); g.fill();
      // side walls
      g.fillStyle = "#26241e";
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(bx, by); g.lineTo(bx, by + bh); g.lineTo(ox, oy + oh); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(ox + ow, oy); g.lineTo(bx + bw, by); g.lineTo(bx + bw, by + bh); g.lineTo(ox + ow, oy + oh); g.closePath(); g.fill();
      // side-wall frames (perspective hints)
      g.fillStyle = "#3a3529";
      g.beginPath(); g.moveTo(150, 470); g.lineTo(225, 500); g.lineTo(225, 700); g.lineTo(150, 740); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(750, 470); g.lineTo(675, 500); g.lineTo(675, 700); g.lineTo(750, 740); g.closePath(); g.fill();
      // floor
      const fl = g.createLinearGradient(0, by + bh, 0, oy + oh);
      fl.addColorStop(0, "#221f19"); fl.addColorStop(1, "#2f2a20");
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(bx, by + bh); g.lineTo(bx + bw, by + bh); g.lineTo(ox + ow, oy + oh); g.lineTo(ox, oy + oh); g.closePath(); g.fill();
      // back wall + light
      g.fillStyle = "#2e2b24"; g.fillRect(bx, by, bw, bh);
      const sp = g.createRadialGradient(W / 2, by + 40, 10, W / 2, by + 200, 300);
      sp.addColorStop(0, "rgba(255,226,170,.38)"); sp.addColorStop(1, "rgba(255,226,170,0)");
      g.fillStyle = sp; g.fillRect(bx, by, bw, bh);
      // framed preview
      const pw = 230, ph = 172, px = W / 2 - pw / 2, py = by + 120;
      g.fillStyle = "#0b0c0a"; g.fillRect(px - 16, py - 16, pw + 32, ph + 32);
      g.fillStyle = "#9d875e"; g.fillRect(px - 11, py - 11, pw + 22, ph + 22);
      g.fillStyle = "#e6dcc6"; g.fillRect(px - 7, py - 7, pw + 14, ph + 14);
      if (preview) {
        const ar = preview.width / preview.height, tar = pw / ph;
        let sw = preview.width, sh = preview.height, sx = 0, sy = 0;
        if (ar > tar) { sw = sh * tar; sx = (preview.width - sw) / 2; } else { sh = sw / tar; sy = (preview.height - sh) / 2; }
        g.drawImage(preview, sx, sy, sw, sh, px, py, pw, ph);
      } else { g.fillStyle = "#3c382f"; g.fillRect(px, py, pw, ph); }
      // light spill toward viewer
      const spill = g.createLinearGradient(0, by + bh, 0, oy + oh);
      spill.addColorStop(0, "rgba(255,220,160,.10)"); spill.addColorStop(1, "rgba(255,220,160,0)");
      g.fillStyle = spill;
      g.beginPath(); g.moveTo(bx + 40, by + bh); g.lineTo(bx + bw - 40, by + bh); g.lineTo(ox + ow - 120, oy + oh); g.lineTo(ox + 120, oy + oh); g.closePath(); g.fill();
      // open door leaves
      const leaf = (x0, x1) => {
        g.fillStyle = "#2b2419";
        g.beginPath(); g.moveTo(x0, oy); g.lineTo(x1, oy + 60); g.lineTo(x1, oy + oh - 40); g.lineTo(x0, oy + oh); g.closePath(); g.fill();
        g.strokeStyle = "#5a4c35"; g.lineWidth = 3;
        const inset = (a, b) => { g.beginPath();
          const xa = x0 + (x1 - x0) * 0.22, xb = x0 + (x1 - x0) * 0.78;
          g.moveTo(xa, oy + a); g.lineTo(xb, oy + a + 30); g.lineTo(xb, oy + b - 30); g.lineTo(xa, oy + b); g.closePath(); g.stroke(); };
        inset(90, 470); inset(540, 930);
        g.fillStyle = "#b39a6a"; g.fillRect(x1 - (x1 > x0 ? 14 : -8), oy + oh / 2, 6, 40);
      };
      if (leaves) { leaf(ox, ox + 105); leaf(ox + ow, ox + ow - 105); }
      g.restore();
      // threshold
      g.fillStyle = "#5a5140"; g.fillRect(90, 1226, 720, 14);
    };
    const tex = canvasTex(W, H, draw);
    if (h) {
      const img = new Image();
      img.onload = () => { preview = img; draw(tex.image.getContext("2d")); tex.needsUpdate = true; };
      img.src = h;
    }
    return tex;
  }

  /* ---------- museum rooms ---------- */
  const WALL_H = 3.8, EYE = 1.6;
  let HX = 4.6, HZ = 4.6;
  const WALLC = ["#272822", "#232520", "#22241f", "#242620"];
  const SIDE_NAME = ["정면 벽", "오른쪽 벽", "뒤쪽 벽", "왼쪽 벽"];
  const wallMats = WALLC.map((c) => basic(c));
  const floorMat = basic(0x25231f), ceilMat = basic(0x111310), gridMat = basic(0x38352e);
  const baseMat = basic(0x726449), mouldMat = basic(0x494435);
  const lampMat = basic(0x776446), lampLight = basic(0xfff0c9);
  const TOTAL = DATA.reduce((n, h) => n + h.items.length, 0);

  function wp(side, u, y, off) {
    const o = off || 0;
    return side === 0 ? new THREE.Vector3(u, y, -HZ + o) : side === 1 ? new THREE.Vector3(HX - o, y, u)
      : side === 2 ? new THREE.Vector3(-u, y, HZ - o) : new THREE.Vector3(-HX + o, y, -u);
  }
  const sideRot = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
  const sideYaw = (s) => -s * Math.PI / 2;
  const NORMALS = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)];
  const normalOf = (s) => NORMALS[s];
  const wallLen = (s) => (s % 2 === 0 ? 2 * HX : 2 * HZ);

  let world = new THREE.Group();
  scene.add(world);
  let pickables = [], stops = [], doors = [], cur = 0, mode = "lobby", hallIndex = -1, busy = false;
  let photoMeshes = [], atlasMats = [];
  const cam = { x: 0, z: 1.2, yaw: 0, pitch: 0 };
  let anim = null, looked = false;

  function clearWorld() {
    scene.remove(world);
    world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    world = new THREE.Group(); scene.add(world);
    pickables = []; stops = []; doors = []; photoMeshes = [];
    for (const k in hiRes) { hiRes[k].tex.dispose(); delete texCache[hiRes[k].url]; delete hiRes[k]; }
  }
  function onWall(mesh, side, u, y, off) {
    mesh.position.copy(wp(side, u, y, off));
    mesh.rotation.y = sideRot[side];
    world.add(mesh); return mesh;
  }
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

  function roomShell() {
    for (let s = 0; s < 4; s++) {
      const L = wallLen(s);
      onWall(plane(L, WALL_H, wallMats[s]), s, 0, WALL_H / 2, 0);
      onWall(plane(L, 0.05, baseMat), s, 0, 0.065, 0.01);
      onWall(plane(L, 0.04, mouldMat), s, 0, 3.67, 0.01);
    }
    const fl = plane(2 * HX, 2 * HZ, floorMat); fl.rotation.x = -Math.PI / 2; world.add(fl);
    const ce = plane(2 * HX, 2 * HZ, ceilMat); ce.rotation.x = Math.PI / 2; ce.position.y = WALL_H; world.add(ce);
    for (let x = Math.ceil(-HX); x <= HX; x++) {
      const a = plane(0.018, 2 * HZ, gridMat); a.rotation.x = -Math.PI / 2; a.position.set(x, 0.004, 0); world.add(a);
    }
    for (let z = Math.ceil(-HZ); z <= HZ; z++) {
      const b = plane(2 * HX, 0.018, gridMat); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.005, z); world.add(b);
    }
  }
  function lamp(side, u, width, bare) {
    const top = WALL_H - 0.6;
    const sw = Math.max(1.5, width * 1.45);
    onWall(plane(sw, top, spotMat), side, u, top / 2, 0.012).renderOrder = -1;
    const p = plane(sw * 1.2, 1.4, poolMat); p.rotation.x = -Math.PI / 2; p.renderOrder = -1;
    p.position.copy(wp(side, u, 0.006, 0.75)); p.rotation.z = sideRot[side]; world.add(p);
    if (bare) return;
    onWall(plane(0.05, 0.22, lampMat), side, u, 3.16, 0.02);
    onWall(plane(0.6, 0.085, lampMat), side, u, 3.035, 0.12);
    onWall(plane(0.52, 0.024, lampLight), side, u, 3.0, 0.13);
  }

  /* packed wall labels: title + year · affiliate */
  function labelAtlas(items) {
    const CW = 512, CH = 96, COLS = 2, ROWS = 21, per = COLS * ROWS, mats = [];
    for (let a = 0; a < items.length; a += per) {
      const tex = canvasTex(CW * COLS, 2048, (g) => {
        g.textAlign = "center";
        for (let j = 0; j < per && a + j < items.length; j++) {
          const it = items[a + j], x = (j % COLS) * CW + CW / 2, y = Math.floor(j / COLS) * CH;
          g.fillStyle = "#f3eadb"; g.font = `500 33px ${FONT}`;
          let t = it.title;
          while (g.measureText(t).width > CW - 16 && t.length > 4) t = t.slice(0, -2);
          if (t !== it.title) t += "…";
          g.fillText(t, x, y + 40);
          g.fillStyle = "#d2c29f"; g.font = `400 22px ${FONT}`;
          g.fillText(`${it.year}  ·  ${it.co || "그룹"}`, x, y + 78);
        }
      });
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      mats.push(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    }
    return (i) => {
      const k = Math.floor(i / per), j = i % per;
      const u = (j % COLS) / COLS, row = Math.floor(j / COLS);
      return { mat: mats[k], u, v: 1 - ((row + 1) * CH) / 2048, du: 1 / COLS, dv: CH / 2048 };
    };
  }

  /* ---------- doors (closed leaves that swing open) ---------- */
  function leafTexture() {
    return canvasTex(256, 720, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#2f261a"); gr.addColorStop(1, "#3a2f20");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#6b5a3e"; g.lineWidth = 4;
      g.strokeRect(34, 40, w - 68, 280); g.strokeRect(34, 380, w - 68, 300);
      g.strokeStyle = "#1c160e"; g.lineWidth = 2;
      g.strokeRect(46, 52, w - 92, 256); g.strokeRect(46, 392, w - 92, 276);
      g.fillStyle = "#171208"; g.fillRect(0, 0, 6, h); g.fillRect(w - 4, 0, 4, h);
    });
  }
  const leafTex = leafTexture();
  const leafMat = new THREE.MeshBasicMaterial({ map: leafTex, side: THREE.DoubleSide });
  const knobMat = basic(0xc2a66f);
  function hangDoor(side, u, preview, label, target, width) {
    const DW = width || 2.1, DH = DW * 1240 / 900;
    const grp = new THREE.Group();
    grp.position.copy(wp(side, u, 0, 0.02)); grp.rotation.y = sideRot[side]; world.add(grp);
    const frame = plane(DW, DH, new THREE.MeshBasicMaterial({ map: doorTexture(preview, 0, label, false), transparent: true }));
    frame.position.set(0, DH / 2, 0); grp.add(frame);
    const ow = DW * 700 / 900, oh = DH * 1000 / 1240, lw = ow / 2;
    const mk = (sign) => {
      const pivot = new THREE.Group(); pivot.position.set(-sign * ow / 2, 0, 0.012); grp.add(pivot);
      const leaf = plane(lw, oh, leafMat); leaf.position.set(sign * lw / 2, oh / 2, 0);
      pivot.add(leaf);
      const knob = plane(0.045, 0.2, knobMat); knob.material.side = THREE.DoubleSide; knob.position.set(sign * (lw - 0.09), oh * 0.47, 0.004); pivot.add(knob);
      leaf.userData.door = target; pickables.push(leaf);
      return pivot;
    };
    const rec = { target, left: mk(1), right: mk(-1), t: 0, opening: null };
    frame.userData.door = target; pickables.push(frame);
    doors.push(rec);
    lamp(side, u, DW, true);
    return { w: DW, h: DH };
  }
  function doorFor(target) { return doors.find((d) => d.target === target); }
  function openDoor(rec, dur) {
    if (!rec || rec.t >= 1) return;
    rec.opening = { t0: performance.now(), dur: reduce ? 1 : dur || 900, from: rec.t };
  }
  function stepDoors(now) {
    for (const d of doors) {
      if (!d.opening) continue;
      const t = Math.min(1, (now - d.opening.t0) / d.opening.dur);
      d.t = d.opening.from + (1 - d.opening.from) * (1 - Math.pow(1 - t, 3));
      d.left.rotation.y = -1.8 * d.t; d.right.rotation.y = 1.8 * d.t;
      if (t >= 1) d.opening = null;
    }
  }

  /* ---------- camera framing ---------- */
  function portrait() { return innerHeight > innerWidth * 1.05; }
  function focusPose(side, u, cy, w, h) {
    const vf = THREE.MathUtils.degToRad(camera.fov), asp = camera.aspect;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    const port = portrait();
    const usable = port ? 0.5 : 0.62;
    let d = Math.max((h / 2) / (Math.tan(vf / 2) * usable), (w / 2 + (port ? 0.1 : 0.7)) / Math.tan(hf / 2), 1.0);
    d = Math.min(d, (side % 2 === 0 ? 2 * HZ : 2 * HX) - 0.6);
    const p = wp(side, u, 0, 0).add(normalOf(side).clone().multiplyScalar(d));
    const lookY = cy - Math.tan(vf / 2) * d * (port ? 0.36 : 0.22);
    return { x: p.x, z: p.z, yaw: sideYaw(side), pitch: Math.atan2(lookY - EYE, d) };
  }
  function lobbyOverview() {
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    let d = Math.min(2 * HZ - 0.8, Math.max(3.6, (HX + 0.2) / Math.tan(hf / 2)));
    if (portrait()) d = 2 * HZ - 0.8;
    const p = wp(0, 0, 0, 0).add(normalOf(0).clone().multiplyScalar(d));
    return { x: p.x, z: p.z, yaw: 0, pitch: -0.04 };
  }
  function hallOverview() {
    return { x: -HX + (portrait() ? 1.6 : 2.4), z: 0, yaw: sideYaw(1), pitch: -0.02 };
  }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function moveTo(pose, instant, dur) {
    if (instant || reduce) { Object.assign(cam, pose); anim = null; return; }
    const dy = wrapAngle(pose.yaw - cam.yaw);
    const dist = Math.hypot(pose.x - cam.x, pose.z - cam.z);
    anim = { t0: performance.now(), dur: dur || Math.min(1800, 800 + dist * 60), from: Object.assign({}, cam), to: { x: pose.x, z: pose.z, yaw: cam.yaw + dy, pitch: pose.pitch } };
  }
  function focusFor(s) {
    if (s.kind === "overview") return mode === "lobby" ? lobbyOverview() : hallOverview();
    return focusPose(s.side, s.u, s.fcy !== undefined ? s.fcy : s.cy, s.w, s.h);
  }

  /* ---------- lobby ---------- */
  function buildLobby() {
    clearWorld(); mode = "lobby"; hallIndex = -1; HX = 4.6; HZ = 4.6;
    roomShell();
    DATA.forEach((h, i) => {
      const u = (i - 1) * 3, target = { hall: i };
      hangDoor(0, u, h.items[0].file, { kicker: `ROOM 0${i + 1}  ·  ${h.span}`, title: `제${i + 1}관 ${h.name}` }, target, 2.3);
      stops.push({ kind: "door", side: 0, u, cy: 1.6, w: 2.5, h: 3.3, target, data: h, hall: i });
    });
    hangPanel(3, 0, { kicker: "KUMHO ARCHIVES  ·  1946 — 2008", title: "사이버 금호 아카이브", big: true, sub: "집념으로 닦아온 금호의 궤적",
      text: `택시 두 대로 시작한 금호의 역사를 세 개의 전시관에 걸었습니다. 『금호 50년사 화보편』과 『금호아시아나 60년사』에 실린 사진 ${TOTAL}점을 시간 순서대로 만나 보세요.` }, 3.6, 3.2);
    hangPanel(1, 0, { kicker: "HOW TO VISIT", title: "관람 안내",
      text: "화면을 끌어 전시실을 둘러볼 수 있습니다.\n문을 누르면 문이 열리고 전시관으로 들어갑니다.\n사진을 누르면 그 앞으로 다가가고, 한 번 더 누르면 크게 봅니다.\n아래 필름을 끌거나 눌러 원하는 사진으로 바로 갈 수 있습니다." }, 3.2, 3.1);
    hangPanel(2, 0, { kicker: "EXHIBITION", title: "세 개의 전시관",
      text: DATA.map((h, i) => `제${i + 1}관 ${h.name} (${h.span.replace(/ — /, "~")})  ${h.title}`).join("\n") }, 3.4, 3.1);
    stops.unshift({ kind: "overview" });
    stops.unshift({ kind: "panel", side: 3, u: 0, cy: 2.3, w: 3.8, h: 2.4, title: "사이버 금호 아카이브", sub: "KUMHO ARCHIVES",
      text: `세 개의 전시관에 사진 ${TOTAL}점을 한 점씩 걸었습니다. 정면의 문을 누르면 문이 열리며 전시관으로 들어갑니다.` });
    buildChips(); updateHud(); setNav();
    cur = 1; moveTo(lobbyOverview(), true); showCard();
  }
  function hangPanel(side, u, p, width, topY) {
    const m = panelMesh(p, width);
    const hM = m.userData.h;
    onWall(m, side, u, topY - hM / 2, 0.02);
    return hM;
  }

  /* ---------- one large hall per era ---------- */
  function photoSize(it) {
    const port = it.ar < 0.95;
    let h = port ? 1.5 : 1.15, w = h * it.ar;
    if (w > 1.75) { w = 1.75; h = w / it.ar; }
    return { w, h };
  }
  function buildHall(hi) {
    const h = DATA[hi];
    clearWorld(); mode = "hall"; hallIndex = hi;
    // exhibit sequence in time order, with chapter panels
    const chByFile = {};
    (h.chapters || []).forEach((c, ci) => { chByFile[c.file] = Object.assign({ ci }, c); });
    const seq = [];
    h.items.forEach((it, i) => {
      const c = chByFile[it.file.split("/").pop()];
      if (c) seq.push({ kind: "chapter", c, width: 2.5 });
      const s = photoSize(it);
      seq.push({ kind: "photo", it, i, s, width: s.w + 0.3 });
    });
    if (h.epilogue) seq.push({ kind: "chapter", c: Object.assign({ ci: -1 }, h.epilogue), width: 2.5 });
    const GAP = 1.05, MARGIN = 2.2;
    const total = seq.reduce((a, e) => a + e.width + GAP, 0);
    let acc = 0, split = seq.length;
    for (let k = 0; k < seq.length; k++) { acc += seq[k].width + GAP; if (acc >= total / 2) { split = k + 1; break; } }
    const lenN = seq.slice(0, split).reduce((a, e) => a + e.width + GAP, 0);
    const lenS = seq.slice(split).reduce((a, e) => a + e.width + GAP, 0);
    HX = Math.max(lenN, lenS) / 2 + MARGIN; HZ = 5.2;
    roomShell();
    for (let k = 0; k < 4; k++) {
      atlasMats[k] = atlasMats[k] || new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    const label = labelAtlas(h.items);
    stops.push({ kind: "overview" });
    // west wall: introduction + exit door
    const intro = { kicker: `ROOM 0${hi + 1}  ·  ${h.span}`, title: h.title, sub: `제${hi + 1}관 ${h.name} · ${h.theme}`, text: h.intro_long || h.intro };
    const ih = hangPanel(3, -2.0, intro, 3.3, 3.25);
    stops.push({ kind: "panel", side: 3, u: -2.0, cy: 3.25 - ih / 2, w: 3.5, h: ih + 0.3, title: h.title, sub: `제${hi + 1}관 ${h.name} · ${h.span}`, text: intro.text });
    // east wall: era title
    hangPanel(1, 0, { kicker: `ROOM 0${hi + 1}  ·  ${h.span}`, title: `제${hi + 1}관 ${h.name}`, big: true, sub: h.title, text: h.theme }, 3.6, 3.1);
    const place = (list, side) => {
      let u = -HX + MARGIN;
      list.forEach((e) => {
        const c = u + e.width / 2;
        if (e.kind === "photo") {
          const { w, h: ph } = e.s, it = e.it;
          const cy = Math.min(1.72, 2.72 - ph / 2);
          lamp(side, c, w);
          const layers = [[0.13, M.frameOut, 0.004], [0.1, M.brass, 0.008], [0.045, M.mat, 0.014]];
          for (const [pad, mat, off] of layers) {
            const m = onWall(plane(w + pad * 2, ph + pad * 2, mat), side, c, cy, off);
            m.userData.idx = e.i; pickables.push(m);
          }
          const [k, u0, v0, du, dv] = it.wa;
          const photo = onWall(new THREE.Mesh(uvPlane(w, ph, u0, v0, du, dv), atlasMats[k]), side, c, cy, 0.02);
          photo.userData = { idx: e.i, w, h: ph, k, uv: [u0, v0, du, dv] };
          pickables.push(photo); photoMeshes[e.i] = photo;
          const lb = label(e.i);
          onWall(new THREE.Mesh(uvPlane(1.36, 1.36 * 96 / 512, lb.u, lb.v, lb.du, lb.dv), lb.mat), side, c, cy - ph / 2 - 0.3, 0.02);
          stops.push({ kind: "photo", side, u: c, cy, w: w + 0.4, h: ph + 0.85, fcy: cy - 0.22, idx: e.i, data: it });
        } else {
          const ph = hangPanel(side, c, { kicker: e.c.span || (e.c.ci >= 0 ? `CHAPTER ${String(e.c.ci + 1).padStart(2, "0")}` : "EPILOGUE"), title: e.c.title, text: e.c.text }, e.width, 3.0);
          stops.push({ kind: "chapter", side, u: c, cy: 3.0 - ph / 2, w: e.width + 0.3, h: ph + 0.3, title: e.c.title, sub: e.c.ci >= 0 ? `제${hi + 1}관 ${h.name} · ${e.c.ci + 1}장` : "에필로그", text: e.c.text, chapter: e.c.ci });
        }
        u += e.width + GAP;
      });
    };
    place(seq.slice(0, split), 0);
    place(seq.slice(split), 2);
    let target, label2, preview;
    if (hi + 1 < DATA.length) {
      target = { hall: hi + 1 }; preview = DATA[hi + 1].items[0].file;
      label2 = { kicker: `NEXT  ·  ROOM 0${hi + 2}`, title: `제${hi + 2}관 ${DATA[hi + 1].name}` };
    } else {
      target = { lobby: true }; preview = DATA[0].items[0].file;
      label2 = { kicker: "EXIT", title: "로비로 돌아가기" };
    }
    hangDoor(3, 2.6, preview, label2, target, 2.0);
    stops.push({ kind: "door", side: 3, u: 2.6, cy: 1.45, w: 2.2, h: 3.0, target, label: label2 });
    buildChips(); updateHud(); setNav();
    cur = 0; moveTo(hallOverview(), true); showCard();
    // low-res atlases
    const loading = $("loading"), bar = $("loadBar");
    const need = [...new Set(h.items.map((it) => it.wa[0]))];
    let done = 0; loading.hidden = false; bar.style.width = "0%";
    Promise.all(need.map((k) => loadTex(`wall/atlas_${k}.jpg`).then((t) => {
      atlasMats[k].map = t; atlasMats[k].needsUpdate = true;
      done++; bar.style.width = Math.round((done / need.length) * 100) + "%";
    }).catch(() => {}))).then(() => { loading.hidden = true; });
  }

  /* full-resolution swap for the photos around the visitor */
  const hiRes = {};
  function refreshHiRes() {
    if (mode !== "hall") return;
    const s = stops[cur];
    let center = s && s.kind === "photo" ? s.idx : -1;
    if (center < 0) {
      let bd = 1e9;
      stops.forEach((t) => { if (t.kind === "photo") { const p = wp(t.side, t.u, 0, 0); const d = Math.hypot(p.x - cam.x, p.z - cam.z); if (d < bd) { bd = d; center = t.idx; } } });
    }
    if (center < 0) return;
    const hi = hallIndex, items = DATA[hi].items;
    for (let i = center - 2; i <= center + 3; i++) {
      const m = photoMeshes[i];
      if (!m || hiRes[i]) continue;
      const url = items[i].file;
      hiRes[i] = { pending: true, url, tex: { dispose() {} } };
      loadTex(url).then((t) => {
        if (hallIndex !== hi || !hiRes[i]) return;
        hiRes[i].tex = t; hiRes[i].pending = false;
        m.geometry.dispose(); m.geometry = new THREE.PlaneGeometry(m.userData.w, m.userData.h);
        m.material = new THREE.MeshBasicMaterial({ map: t });
      }).catch(() => { delete hiRes[i]; });
    }
    for (const k in hiRes) {
      if (Math.abs(+k - center) <= 8 || hiRes[k].pending) continue;
      const m = photoMeshes[k], r = hiRes[k];
      if (m) { m.geometry.dispose(); const [u0, v0, du, dv] = m.userData.uv; m.geometry = uvPlane(m.userData.w, m.userData.h, u0, v0, du, dv); m.material = atlasMats[m.userData.k]; }
      r.tex.dispose(); delete texCache[r.url]; delete hiRes[k];
    }
  }

  function setStop(i) {
    if (busy) return;
    looked = false;
    if (i < 0) return;
    if (i >= stops.length) { const s = stops[stops.length - 1]; if (s.kind === "door") walkThrough(s.target); return; }
    cur = i;
    moveTo(focusFor(stops[cur]));
    showCard(); syncChips(); refreshHiRes();
  }

  /* ---------- UI ---------- */
  function setNav() {
    document.querySelectorAll("#hallNav button").forEach((b) => {
      const k = b.dataset.k;
      b.setAttribute("aria-pressed", String(mode === "lobby" ? k === "lobby" : k === String(hallIndex)));
    });
  }
  function updateHud() {
    if (mode === "lobby") { $("roomNo").textContent = "LOBBY  ·  1946 — 2008"; $("roomName").textContent = "사이버 금호 아카이브"; }
    else {
      const h = DATA[hallIndex];
      $("roomNo").textContent = `ROOM 0${hallIndex + 1}  ·  ${h.span}  ·  ${h.title}`;
      $("roomName").textContent = `제${hallIndex + 1}관 ${h.name}`;
    }
  }
  function buildChips() {
    const box = $("chips"); box.innerHTML = "";
    if (mode !== "hall") { box.hidden = true; return; }
    box.hidden = false;
    stops.forEach((s, si) => {
      if (s.kind !== "chapter") return;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.title;
      b.dataset.stop = si;
      b.addEventListener("click", () => setStop(si));
      box.appendChild(b);
    });
    syncChips();
  }
  function syncChips() {
    const box = $("chips"); if (box.hidden) return;
    let active = -1;
    stops.forEach((s, si) => { if (s.kind === "chapter" && si <= cur) active = si; });
    box.querySelectorAll("button").forEach((b) => {
      const on = +b.dataset.stop === active;
      b.setAttribute("aria-pressed", String(on));
      if (on) box.scrollTo({ left: b.offsetLeft - box.clientWidth / 2 + b.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
    });
  }
  const set = (id, v) => { const el = $(id); el.textContent = v || ""; el.hidden = !v; };
  function showCard() {
    const s = stops[cur]; if (!s) return;
    syncFilm();
    const total = mode === "hall" ? DATA[hallIndex].items.length : 0;
    $("zoomBtn").hidden = s.kind !== "photo";
    $("enterBtn2").hidden = s.kind !== "door";
    $("prevBtn").disabled = cur === 0;
    $("nextBtn").disabled = mode === "lobby" && cur === stops.length - 1;
    set("cSrc", "");
    if (s.kind === "photo") {
      const it = s.data;
      set("cYear", `${it.year}  ·  ${it.co || "그룹"}`); set("cTitle", it.title); set("cCap", it.cap);
      set("cDetail", it.detail);
      set("cCount", `${String(s.idx + 1).padStart(3, "0")} / ${String(total).padStart(3, "0")}`);
    } else if (s.kind === "door" && mode === "lobby") {
      const h = s.data;
      set("cYear", `ROOM 0${s.hall + 1} · ${h.name} · ${h.span}`); set("cTitle", h.title);
      set("cCap", h.theme); set("cDetail", h.intro_long || h.intro); set("cCount", `사진 ${h.items.length}점`);
      $("enterBtn2").textContent = "문 열고 입장";
    } else if (s.kind === "door") {
      set("cYear", s.label.kicker); set("cTitle", s.label.title); set("cCap", "문을 누르면 문이 열리며 이동합니다.");
      set("cDetail", ""); set("cCount", "");
      $("enterBtn2").textContent = s.target.lobby ? "로비로" : "다음 관으로";
    } else if (s.kind === "overview" && mode === "lobby") {
      set("cYear", "THREE GALLERIES"); set("cTitle", "세 개의 전시관");
      set("cCap", DATA.map((h, i) => `제${i + 1}관 ${h.name} ${h.span}`).join("   ·   "));
      set("cDetail", "보고 싶은 전시관의 문을 누르면 문이 열리며 입장합니다."); set("cCount", "");
    } else if (s.kind === "overview") {
      const h = DATA[hallIndex];
      set("cYear", `제${hallIndex + 1}관 ${h.name}  ·  ${h.span}`); set("cTitle", h.title);
      set("cCap", `사진 ${h.items.length}점을 시간 순서대로 걸었습니다. → 를 누르거나 사진을 눌러 감상하세요.`);
      set("cDetail", h.intro_long || h.intro); set("cCount", "");
    } else {
      set("cYear", s.sub); set("cTitle", s.title); set("cCap", "");
      set("cDetail", s.text); set("cCount", "");
    }
  }

  function go(build) {
    if (busy) return; busy = true;
    const f = $("fade"); f.classList.add("on");
    setTimeout(() => { build(); requestAnimationFrame(() => { f.classList.remove("on"); busy = false; }); }, reduce ? 0 : 420);
  }
  function enterTarget(target) {
    if (target.lobby) buildLobby(); else buildHall(target.hall);
  }
  function walkThrough(target) {
    if (busy) return;
    const s = stops.find((t) => t.kind === "door" && t.target === target);
    const rec = doorFor(target);
    const si = stops.indexOf(s);
    if (si >= 0 && si !== cur) { cur = si; showCard(); }
    if (s) moveTo(focusPose(s.side, s.u, 1.5, s.w, s.h), false, 700);
    setTimeout(() => {
      openDoor(rec, 900);
      setTimeout(() => {
        if (s) { const p = wp(s.side, s.u, 0, 0).add(normalOf(s.side).clone().multiplyScalar(0.5)); moveTo({ x: p.x, z: p.z, yaw: sideYaw(s.side), pitch: 0 }, false, 700); }
        setTimeout(() => go(() => enterTarget(target)), reduce ? 0 : 450);
      }, reduce ? 0 : 850);
    }, reduce ? 0 : (s ? 650 : 0));
  }
  function openLB(s) {
    const it = s.data;
    $("lbImg").src = it.file; $("lbImg").alt = it.title;
    $("lbYear").textContent = `${it.year}  ·  ${it.co || "그룹"}`; $("lbTitle").textContent = it.title;
    $("lbCap").textContent = it.cap; $("lbDetail").textContent = it.detail || "";
    $("lbSrc").textContent = "";
    $("lb").hidden = false; $("lbClose").focus();
  }
  function closeLB() { $("lb").hidden = true; }

  /* ---------- input ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hs = ray.intersectObjects(pickables, false);
    return hs.length ? hs[0].object : null;
  }
  function pick(cx, cy) {
    const o = hit(cx, cy); if (!o) return;
    if (o.userData.door) { walkThrough(o.userData.door); return; }
    if (o.userData.idx !== undefined) {
      const si = stops.findIndex((s) => s.kind === "photo" && s.idx === o.userData.idx);
      if (si === cur && !anim && !looked) openLB(stops[si]); else setStop(si);
    }
  }
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) { canvas.style.cursor = hit(e.clientX, e.clientY) ? "pointer" : "grab"; return; }
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    if (drag.moved > 6) {
      anim = null; looked = true;
      const k = THREE.MathUtils.degToRad(camera.fov) / canvas.clientHeight;
      cam.yaw += dx * k;                 // the room follows the pointer
      cam.pitch = Math.max(-0.5, Math.min(0.5, cam.pitch + dy * k));
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved <= 8) pick(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  let wheelLock = 0;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = performance.now(); if (now < wheelLock) return;
    const v = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(v) < 8) return;
    wheelLock = now + 600; step(v > 0 ? 1 : -1);
  }, { passive: false });
  function step(dir) { setStop(cur + dir); }
  window.addEventListener("keydown", (e) => {
    if (!$("lb").hidden) { if (e.key === "Escape") closeLB(); return; }
    if (!$("intro").hidden) return;
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Enter") { const s = stops[cur]; if (s.kind === "door") walkThrough(s.target); else if (s.kind === "photo") openLB(s); }
    else if (e.key === "Escape" && mode === "hall") go(buildLobby);
  });
  $("prevBtn").addEventListener("click", () => step(-1));
  $("nextBtn").addEventListener("click", () => step(1));
  $("zoomBtn").addEventListener("click", () => { const s = stops[cur]; if (s.kind === "photo") openLB(s); });
  $("enterBtn2").addEventListener("click", () => { const s = stops[cur]; if (s.kind === "door") walkThrough(s.target); });
  document.querySelectorAll("[data-look]").forEach((b) => b.addEventListener("click", () => {
    const dy = THREE.MathUtils.degToRad(+b.dataset.look);
    anim = { t0: performance.now(), dur: 500, from: Object.assign({}, cam), to: Object.assign({}, cam, { yaw: cam.yaw + dy }) };
    looked = true;
  }));
  $("lbClose").addEventListener("click", closeLB);
  $("lb").addEventListener("click", (e) => { if (e.target === $("lb")) closeLB(); });
  document.querySelectorAll("#hallNav button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k;
    if (k === "lobby") { if (mode !== "lobby") go(buildLobby); }
    else go(() => buildHall(+k));
  }));
  $("enterBtn").addEventListener("click", () => { $("intro").hidden = true; });

  /* ---------- film strip ---------- */
  const film = $("film");
  let filmKey = "", filmDrag = null, filmMoved = false;
  function buildFilm() {
    const frag = document.createDocumentFragment();
    DATA.forEach((h, hi) => {
      const lab = document.createElement("button");
      lab.type = "button"; lab.className = "reel"; lab.dataset.h = hi;
      lab.innerHTML = `<b>ROOM 0${hi + 1}</b><span>${h.name}</span><small>${h.span}</small>`;
      lab.addEventListener("click", () => { if (!filmMoved) go(() => buildHall(hi)); });
      frag.appendChild(lab);
      h.items.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "frame"; b.dataset.h = hi; b.dataset.i = i;
        b.title = `${it.year} ${it.title}`;
        b.setAttribute("aria-label", `${it.year} ${it.title}`);
        const im = document.createElement("i");
        const [sh, c, r, rows] = it.film;
        im.style.cssText = `background-image:url(film/sheet_${sh}.jpg);--c:${c};--r:${r};--rows:${rows}`;
        const y = document.createElement("span"); y.textContent = it.year;
        b.append(im, y);
        b.addEventListener("click", () => { if (!filmMoved) goToPhoto(hi, i); });
        frag.appendChild(b);
      });
    });
    film.appendChild(frag);
  }
  function goToPhoto(hi, idx) {
    if (busy) return;
    if (mode === "hall" && hi === hallIndex) {
      const si = stops.findIndex((s) => s.kind === "photo" && s.idx === idx);
      if (si >= 0) { setStop(si); return; }
    }
    go(() => {
      buildHall(hi);
      const si = stops.findIndex((s) => s.kind === "photo" && s.idx === idx);
      if (si >= 0) { cur = si; moveTo(focusFor(stops[si]), true); showCard(); syncChips(); refreshHiRes(); }
    });
  }
  function syncFilm() {
    if (!film) return;
    const s = stops[cur];
    const hi = mode === "hall" ? hallIndex : -1;
    const idx = s && s.kind === "photo" ? s.idx : -1;
    const key = `${hi}|${idx}`;
    if (key === filmKey) return;
    filmKey = key;
    let target = null;
    film.querySelectorAll(".frame, .reel").forEach((b) => {
      const bh = +b.dataset.h;
      b.classList.toggle("dim", hi >= 0 && bh !== hi);
      if (b.classList.contains("frame")) {
        const on = bh === hi && +b.dataset.i === idx;
        b.setAttribute("aria-current", on ? "true" : "false");
        if (on) target = b;
      } else if (bh === hi && idx < 0) target = b;
    });
    if (filmDrag) return;
    if (!target) { if (hi < 0) film.scrollTo({ left: 0, behavior: reduce ? "auto" : "smooth" }); return; }
    const left = target.offsetLeft - film.clientWidth / 2 + target.offsetWidth / 2;
    film.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }
  if (film) {
    buildFilm();
    film.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { film.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    // drag to scroll (mouse and touch)
    film.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") { filmMoved = false; return; } // native touch scrolling
      filmDrag = { x: e.clientX, left: film.scrollLeft, id: e.pointerId };
      filmMoved = false;
    });
    window.addEventListener("pointermove", (e) => {
      if (!filmDrag || e.pointerId !== filmDrag.id) return;
      const dx = e.clientX - filmDrag.x;
      if (!filmMoved && Math.abs(dx) > 5) { filmMoved = true; film.classList.add("dragging"); }
      if (filmMoved) { film.scrollLeft = filmDrag.left - dx; e.preventDefault(); }
    });
    const endFilm = () => {
      if (!filmDrag) return;
      filmDrag = null; film.classList.remove("dragging");
      setTimeout(() => { filmMoved = false; }, 0);
    };
    window.addEventListener("pointerup", endFilm);
    window.addEventListener("pointercancel", endFilm);
    film.addEventListener("click", (e) => { if (filmMoved) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  /* ---------- loop ---------- */
  let lastW = 0, lastH = 0, hiTimer = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === lastW && h === lastH) return false;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = portrait() ? 64 : 52;
    camera.updateProjectionMatrix();
    return true;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  camera.rotation.order = "YXZ";
  function frame(now) {
    if (resize() && stops.length && !looked) moveTo(focusFor(stops[cur]), true);
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur), k = ease(t);
      for (const key of ["x", "z", "yaw", "pitch"]) cam[key] = anim.from[key] + (anim.to[key] - anim.from[key]) * k;
      if (t >= 1) anim = null;
    }
    stepDoors(now);
    if (now - hiTimer > 1500) { hiTimer = now; if (looked) refreshHiRes(); }
    camera.position.set(cam.x, EYE, cam.z);
    camera.rotation.set(cam.pitch, cam.yaw, 0);
    const b = $("bearing");
    if (b) { const q = Math.round(wrapAngle(-cam.yaw) / (Math.PI / 2)); b.textContent = SIDE_NAME[((q % 4) + 4) % 4]; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  const start = () => { resize(); buildLobby(); requestAnimationFrame(frame); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start, start);
})();
