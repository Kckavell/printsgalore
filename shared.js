// ── Mobile nav ──────────────────────────────────────────────────────────────
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;
  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
  });
  mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }));
}

// ── Scroll fade-in ───────────────────────────────────────────────────────────
function initScrollObserver() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
}

// ── Colour utilities (hex only) ──────────────────────────────────────────────
function adjustColour(hex, amount) {
  if (!hex || typeof hex !== 'string') return '#888888';
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xFF) + amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── T-shirt photo mockup loader ──────────────────────────────────────────────
// Expects images/tshirt-mockup.jpg — a side-by-side flat-lay showing
// the shirt front (left half) and shirt back (right half).
const _tshirtMockup = (function() {
  const state = { img: null, error: false };
  const img = new Image();
  img.onload = function() {
    state.img = img;
    // Notify the preview tool to re-render with the real photo
    if (typeof window._onGarmentImageLoad === 'function') window._onGarmentImageLoad();
  };
  img.onerror = function() { state.error = true; };
  img.src = 'images/tshirt-mockup.jpg';
  return state;
}());

// ── Canvas: garment drawing ──────────────────────────────────────────────────
// Design space: 600×700. All coords are scaled to actual canvas at draw time.

const PRINT_AREAS = {
  tshirt:      { x: 0.29, y: 0.42, w: 0.42, h: 0.28 },
  tshirt_back: { x: 0.25, y: 0.36, w: 0.50, h: 0.40 },
  hoodie:      { x: 0.29, y: 0.42, w: 0.42, h: 0.26 },
  cap:         { x: 0.22, y: 0.26, w: 0.56, h: 0.38 },
};

function getPrintAreaPx(canvas, product, view) {
  const key = (product === 'tshirt' && view === 'back') ? 'tshirt_back' : product;
  const pa = PRINT_AREAS[key] || PRINT_AREAS.tshirt;
  return {
    x: pa.x * canvas.width,
    y: pa.y * canvas.height,
    w: pa.w * canvas.width,
    h: pa.h * canvas.height,
  };
}

function drawGarment(canvas, product, colour, view) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (product === 'tshirt') drawTshirt(ctx, canvas.width, canvas.height, colour, view || 'front');
  else if (product === 'hoodie') drawHoodie(ctx, canvas.width, canvas.height, colour);
  else if (product === 'cap') drawCap(ctx, canvas.width, canvas.height, colour);
}

// ── Studio backdrop + grounding shadow (shared across garments) ─────────────
function drawStudioBackdrop(ctx, W, H) {
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.36, H * 0.08, W * 0.5, H * 0.5, H * 0.78);
  bg.addColorStop(0, '#f4f7ff');
  bg.addColorStop(1, '#e2e8f8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

function drawGroundShadow(ctx, W, H, cxFrac, cyFrac, wFrac, hFrac) {
  ctx.save();
  const grad = ctx.createRadialGradient(W * cxFrac, H * cyFrac, 0, W * cxFrac, H * cyFrac, W * wFrac);
  grad.addColorStop(0, 'rgba(20,17,15,0.18)');
  grad.addColorStop(1, 'rgba(20,17,15,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(W * cxFrac, H * cyFrac, W * wFrac, H * hFrac, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function softEdgeShade(ctx, pathFn) {
  ctx.save();
  pathFn();
  ctx.clip();
  ctx.strokeStyle = 'rgba(15,13,11,0.12)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(15,13,11,0.22)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function ribTexture(ctx, x0, y0, x1, y1, count) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 1.5);
    ctx.lineTo(x + 5, y + 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

// ── T-shirt drawing ──────────────────────────────────────────────────────────
// When images/tshirt-mockup.jpg is present, uses the photo (left half = front,
// right half = back). Falls back to full canvas drawing otherwise.

function drawTshirt(ctx, W, H, colour, view) {
  view = view || 'front';
  if (_tshirtMockup.img) {
    _drawTshirtPhoto(ctx, W, H, colour, view);
  } else {
    _drawTshirtCanvas(ctx, W, H, colour, view);
  }
}

function _drawTshirtPhoto(ctx, W, H, colour, view) {
  const img = _tshirtMockup.img;
  // The mockup image has front on the left half, back on the right half
  const halfW = img.naturalWidth / 2;
  const srcX  = view === 'back' ? halfW : 0;

  // Draw the appropriate half scaled to fill the canvas
  ctx.drawImage(img, srcX, 0, halfW, img.naturalHeight, 0, 0, W, H);

  // Apply garment colour tint, clipped to the shirt silhouette so the
  // grey studio background is left untouched
  if (colour && colour.toLowerCase() !== '#fbfaf7') {
    const p = (x, y) => [x * W / 600, y * H / 700];
    ctx.save();
    // Shirt body silhouette path (matches the flat-lay proportions)
    ctx.beginPath();
    ctx.moveTo(...p(215, 88));
    ctx.bezierCurveTo(...p(190, 82), ...p(138, 88), ...p(70, 118));
    ctx.bezierCurveTo(...p(42, 128), ...p(8, 162), ...p(8, 218));
    ctx.bezierCurveTo(...p(8, 237), ...p(30, 254), ...p(78, 252));
    ctx.bezierCurveTo(...p(100, 252), ...p(120, 252), ...p(132, 264));
    ctx.bezierCurveTo(...p(128, 390), ...p(122, 510), ...p(122, 622));
    ctx.bezierCurveTo(...p(188, 640), ...p(412, 640), ...p(478, 622));
    ctx.bezierCurveTo(...p(478, 510), ...p(472, 390), ...p(468, 264));
    ctx.bezierCurveTo(...p(480, 252), ...p(500, 252), ...p(522, 252));
    ctx.bezierCurveTo(...p(570, 254), ...p(592, 237), ...p(592, 218));
    ctx.bezierCurveTo(...p(592, 162), ...p(558, 128), ...p(530, 118));
    ctx.bezierCurveTo(...p(462, 88), ...p(410, 82), ...p(385, 88));
    // Include collar area
    ctx.bezierCurveTo(...p(362, 90), ...p(340, 136), ...p(300, 142));
    ctx.bezierCurveTo(...p(260, 136), ...p(238, 90), ...p(215, 88));
    ctx.closePath();
    ctx.clip();
    // Multiply tint: white fabric becomes the chosen colour
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function _drawTshirtCanvas(ctx, W, H, colour, view) {
  view = view || 'front';
  const p = (x, y) => [x * W / 600, y * H / 700];

  drawStudioBackdrop(ctx, W, H);
  drawGroundShadow(ctx, W, H, 0.5, 0.94, 0.32, 0.04);

  const grad = ctx.createLinearGradient(W * 0.08, 0, W * 0.85, H * 0.97);
  grad.addColorStop(0,    adjustColour(colour, 24));
  grad.addColorStop(0.38, colour);
  grad.addColorStop(0.72, adjustColour(colour, -8));
  grad.addColorStop(1,    adjustColour(colour, -26));

  function bodyPath() {
    ctx.beginPath();
    ctx.moveTo(...p(215, 88));
    ctx.bezierCurveTo(...p(190, 82), ...p(138, 88), ...p(70, 118));
    ctx.bezierCurveTo(...p(42, 128), ...p(8, 162), ...p(8, 218));
    ctx.bezierCurveTo(...p(8, 237), ...p(30, 254), ...p(78, 252));
    ctx.bezierCurveTo(...p(100, 252), ...p(120, 252), ...p(132, 264));
    ctx.bezierCurveTo(...p(128, 390), ...p(122, 510), ...p(122, 622));
    ctx.bezierCurveTo(...p(188, 640), ...p(412, 640), ...p(478, 622));
    ctx.bezierCurveTo(...p(478, 510), ...p(472, 390), ...p(468, 264));
    ctx.bezierCurveTo(...p(480, 252), ...p(500, 252), ...p(522, 252));
    ctx.bezierCurveTo(...p(570, 254), ...p(592, 237), ...p(592, 218));
    ctx.bezierCurveTo(...p(592, 162), ...p(558, 128), ...p(530, 118));
    ctx.bezierCurveTo(...p(462, 88), ...p(410, 82), ...p(385, 88));
    ctx.bezierCurveTo(...p(362, 90), ...p(340, 136), ...p(300, 142));
    ctx.bezierCurveTo(...p(260, 136), ...p(238, 90), ...p(215, 88));
    ctx.closePath();
  }

  ctx.save();
  bodyPath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  bodyPath();
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';

  let [ax, ay] = p(108, 258);
  let underL = ctx.createRadialGradient(ax, ay, 0, ax, ay, W * 0.17);
  underL.addColorStop(0, 'rgba(0,0,0,0.32)');
  underL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = underL; ctx.fillRect(0, 0, W, H);

  let [bx, by] = p(492, 258);
  let underR = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.17);
  underR.addColorStop(0, 'rgba(0,0,0,0.32)');
  underR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = underR; ctx.fillRect(0, 0, W, H);

  let [cx2, cy2] = p(300, 420);
  let crease = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, W * 0.1);
  crease.addColorStop(0, 'rgba(0,0,0,0.16)');
  crease.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = crease; ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'screen';
  let [hx, hy] = p(255, 175);
  let chestLight = ctx.createRadialGradient(hx, hy, 0, hx, hy, W * 0.22);
  chestLight.addColorStop(0, 'rgba(255,255,255,0.16)');
  chestLight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = chestLight; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  softEdgeShade(ctx, bodyPath);

  // ── Collar ────────────────────────────────────────────────────────────────
  if (view === 'front') {
    // Front V-collar
    function collarPathFront() {
      ctx.beginPath();
      ctx.moveTo(...p(215, 88));
      ctx.bezierCurveTo(...p(238, 90), ...p(260, 136), ...p(300, 142));
      ctx.bezierCurveTo(...p(340, 136), ...p(362, 90), ...p(385, 88));
      ctx.bezierCurveTo(...p(375, 74), ...p(355, 66), ...p(330, 72));
      ctx.bezierCurveTo(...p(320, 76), ...p(310, 82), ...p(300, 82));
      ctx.bezierCurveTo(...p(290, 82), ...p(280, 76), ...p(270, 72));
      ctx.bezierCurveTo(...p(245, 66), ...p(225, 74), ...p(215, 88));
      ctx.closePath();
    }
    collarPathFront();
    const [colx, coly] = p(300, 95);
    const collarGrad = ctx.createRadialGradient(colx, coly, 0, colx, coly, W * 0.18);
    collarGrad.addColorStop(0, adjustColour(colour, -22));
    collarGrad.addColorStop(1, adjustColour(colour, -6));
    ctx.fillStyle = collarGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,11,0.28)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ribTexture(ctx, ...p(245, 78), ...p(355, 78), 9);
  } else {
    // Back round collar — higher, flatter neckline
    function collarPathBack() {
      ctx.beginPath();
      ctx.moveTo(...p(215, 88));
      ctx.bezierCurveTo(...p(235, 80), ...p(265, 68), ...p(300, 66));
      ctx.bezierCurveTo(...p(335, 68), ...p(365, 80), ...p(385, 88));
      ctx.bezierCurveTo(...p(378, 62), ...p(348, 52), ...p(300, 50));
      ctx.bezierCurveTo(...p(252, 52), ...p(222, 62), ...p(215, 88));
      ctx.closePath();
    }
    collarPathBack();
    const [colx, coly] = p(300, 72);
    const collarGrad = ctx.createRadialGradient(colx, coly, 0, colx, coly, W * 0.16);
    collarGrad.addColorStop(0, adjustColour(colour, -22));
    collarGrad.addColorStop(1, adjustColour(colour, -6));
    ctx.fillStyle = collarGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,11,0.28)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ribTexture(ctx, ...p(250, 68), ...p(350, 68), 9);
  }

  // ── Shoulder seams ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.setLineDash([2.5, 3.5]);
  ctx.strokeStyle = 'rgba(15,13,11,0.18)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(...p(215, 88)); ctx.lineTo(...p(70, 118));
  ctx.moveTo(...p(385, 88)); ctx.lineTo(...p(530, 118));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Sleeve cuffs ──────────────────────────────────────────────────────────
  function cuffPath(side) {
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(...p(8, 218));
      ctx.bezierCurveTo(...p(8, 237), ...p(30, 254), ...p(78, 252));
      ctx.bezierCurveTo(...p(30, 244), ...p(8, 226), ...p(8, 218));
    } else {
      ctx.moveTo(...p(592, 218));
      ctx.bezierCurveTo(...p(592, 237), ...p(570, 254), ...p(522, 252));
      ctx.bezierCurveTo(...p(570, 244), ...p(592, 226), ...p(592, 218));
    }
    ctx.closePath();
  }
  [['left', 35, 240], ['right', 565, 240]].forEach(([side, rx, ry]) => {
    cuffPath(side);
    const [rxp, ryp] = p(rx, ry);
    const g = ctx.createRadialGradient(rxp, ryp, 0, rxp, ryp, W * 0.07);
    g.addColorStop(0, adjustColour(colour, -18));
    g.addColorStop(1, adjustColour(colour, -4));
    ctx.fillStyle = g;
    ctx.fill();
  });

  // ── Bottom hem ─────────────────────────────────────────────────────────────
  function hemPath() {
    ctx.beginPath();
    ctx.moveTo(...p(122, 622));
    ctx.bezierCurveTo(...p(188, 640), ...p(412, 640), ...p(478, 622));
    ctx.bezierCurveTo(...p(412, 632), ...p(188, 632), ...p(122, 622));
    ctx.closePath();
  }
  hemPath();
  const hemGrad = ctx.createLinearGradient(...p(300, 622), ...p(300, 640));
  hemGrad.addColorStop(0, adjustColour(colour, -6));
  hemGrad.addColorStop(1, adjustColour(colour, -16));
  ctx.fillStyle = hemGrad;
  ctx.fill();
  ribTexture(ctx, ...p(170, 633), ...p(430, 633), 14);

  // ── Centre fold line ───────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(...p(300, 144));
  ctx.bezierCurveTo(...p(298, 250), ...p(297, 400), ...p(300, 600));
  ctx.strokeStyle = 'rgba(15,13,11,0.07)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawHoodie(ctx, W, H, colour) {
  const p = (x, y) => [x * W / 600, y * H / 700];

  drawStudioBackdrop(ctx, W, H);
  drawGroundShadow(ctx, W, H, 0.5, 0.95, 0.30, 0.038);

  const grad = ctx.createLinearGradient(W * 0.08, 0, W * 0.88, H * 0.97);
  grad.addColorStop(0,    adjustColour(colour, 22));
  grad.addColorStop(0.38, colour);
  grad.addColorStop(0.72, adjustColour(colour, -10));
  grad.addColorStop(1,    adjustColour(colour, -24));

  function hoodPath() {
    ctx.beginPath();
    ctx.moveTo(...p(210, 95));
    ctx.bezierCurveTo(...p(185, 88), ...p(138, 90), ...p(68, 120));
    ctx.bezierCurveTo(...p(40, 130), ...p(8, 164), ...p(8, 222));
    ctx.bezierCurveTo(...p(8, 241), ...p(30, 258), ...p(78, 256));
    ctx.bezierCurveTo(...p(100, 256), ...p(122, 256), ...p(134, 268));
    ctx.bezierCurveTo(...p(130, 400), ...p(124, 530), ...p(124, 642));
    ctx.lineTo(...p(476, 642));
    ctx.bezierCurveTo(...p(476, 530), ...p(470, 400), ...p(466, 268));
    ctx.bezierCurveTo(...p(478, 256), ...p(500, 256), ...p(522, 256));
    ctx.bezierCurveTo(...p(570, 258), ...p(592, 241), ...p(592, 222));
    ctx.bezierCurveTo(...p(592, 164), ...p(560, 130), ...p(532, 120));
    ctx.bezierCurveTo(...p(462, 90), ...p(415, 88), ...p(390, 95));
    ctx.bezierCurveTo(...p(380, 88), ...p(370, 50), ...p(350, 18));
    ctx.bezierCurveTo(...p(335, 8), ...p(265, 8), ...p(250, 18));
    ctx.bezierCurveTo(...p(230, 50), ...p(220, 88), ...p(210, 95));
    ctx.closePath();
  }

  ctx.save();
  hoodPath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  hoodPath();
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';

  const [ulx, uly] = p(112, 264);
  let uL = ctx.createRadialGradient(ulx, uly, 0, ulx, uly, W * 0.16);
  uL.addColorStop(0, 'rgba(0,0,0,0.30)');
  uL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = uL; ctx.fillRect(0, 0, W, H);

  const [urx, ury] = p(488, 264);
  let uR = ctx.createRadialGradient(urx, ury, 0, urx, ury, W * 0.16);
  uR.addColorStop(0, 'rgba(0,0,0,0.30)');
  uR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = uR; ctx.fillRect(0, 0, W, H);

  const [px300, py430] = p(300, 430);
  let mid = ctx.createRadialGradient(px300, py430, 0, px300, py430, W * 0.09);
  mid.addColorStop(0, 'rgba(0,0,0,0.14)');
  mid.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mid; ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'screen';
  const [hlx, hly] = p(252, 172);
  let highlight = ctx.createRadialGradient(hlx, hly, 0, hlx, hly, W * 0.21);
  highlight.addColorStop(0, 'rgba(255,255,255,0.18)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = highlight; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  softEdgeShade(ctx, hoodPath);

  ctx.beginPath();
  ctx.moveTo(...p(210, 95));
  ctx.bezierCurveTo(...p(222, 90), ...p(234, 72), ...p(252, 50));
  ctx.bezierCurveTo(...p(268, 32), ...p(284, 22), ...p(300, 20));
  ctx.bezierCurveTo(...p(316, 22), ...p(332, 32), ...p(348, 50));
  ctx.bezierCurveTo(...p(366, 72), ...p(378, 90), ...p(390, 95));
  ctx.bezierCurveTo(...p(370, 50), ...p(335, 8), ...p(300, 8));
  ctx.bezierCurveTo(...p(265, 8), ...p(230, 50), ...p(210, 95));
  ctx.closePath();
  const [hcx, hcy] = p(300, 52);
  const hoodInterior = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, W * 0.2);
  hoodInterior.addColorStop(0, adjustColour(colour, -34));
  hoodInterior.addColorStop(0.6, adjustColour(colour, -16));
  hoodInterior.addColorStop(1, adjustColour(colour, -6));
  ctx.fillStyle = hoodInterior;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(...p(210, 95));
  ctx.bezierCurveTo(...p(222, 90), ...p(234, 72), ...p(252, 50));
  ctx.bezierCurveTo(...p(268, 32), ...p(284, 22), ...p(300, 20));
  ctx.bezierCurveTo(...p(316, 22), ...p(332, 32), ...p(348, 50));
  ctx.bezierCurveTo(...p(366, 72), ...p(378, 90), ...p(390, 95));
  ctx.strokeStyle = 'rgba(15,13,11,0.30)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = adjustColour(colour, -30);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(...p(275, 95));
  ctx.bezierCurveTo(...p(272, 180), ...p(268, 310), ...p(262, 400));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...p(325, 95));
  ctx.bezierCurveTo(...p(328, 180), ...p(332, 310), ...p(338, 400));
  ctx.stroke();
  [[262, 405], [338, 405]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(...p(dx, dy), W * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = adjustColour(colour, -36);
    ctx.fill();
  });
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(...p(185, 462));
  ctx.bezierCurveTo(...p(182, 449), ...p(182, 420), ...p(188, 412));
  ctx.bezierCurveTo(...p(214, 404), ...p(386, 404), ...p(412, 412));
  ctx.bezierCurveTo(...p(418, 420), ...p(418, 449), ...p(415, 462));
  ctx.bezierCurveTo(...p(390, 470), ...p(210, 470), ...p(185, 462));
  ctx.closePath();
  const [pkx, pky] = p(300, 437);
  const pocketGrad = ctx.createRadialGradient(pkx, pky, 0, pkx, pky, W * 0.2);
  pocketGrad.addColorStop(0, adjustColour(colour, -4));
  pocketGrad.addColorStop(1, adjustColour(colour, -14));
  ctx.fillStyle = pocketGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,13,11,0.16)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...p(300, 408));
  ctx.lineTo(...p(300, 468));
  ctx.strokeStyle = 'rgba(15,13,11,0.12)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([2.5, 3.5]);
  ctx.strokeStyle = 'rgba(15,13,11,0.16)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(...p(210, 95)); ctx.lineTo(...p(68, 120));
  ctx.moveTo(...p(390, 95)); ctx.lineTo(...p(532, 120));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  [['left', 35, 244], ['right', 565, 244]].forEach(([side, rx, ry]) => {
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(...p(8, 222));
      ctx.bezierCurveTo(...p(8, 241), ...p(30, 258), ...p(78, 256));
      ctx.bezierCurveTo(...p(30, 248), ...p(8, 230), ...p(8, 222));
    } else {
      ctx.moveTo(...p(592, 222));
      ctx.bezierCurveTo(...p(592, 241), ...p(570, 258), ...p(522, 256));
      ctx.bezierCurveTo(...p(570, 248), ...p(592, 230), ...p(592, 222));
    }
    ctx.closePath();
    const [rxp, ryp] = p(rx, ry);
    const g = ctx.createRadialGradient(rxp, ryp, 0, rxp, ryp, W * 0.07);
    g.addColorStop(0, adjustColour(colour, -20));
    g.addColorStop(1, adjustColour(colour, -6));
    ctx.fillStyle = g;
    ctx.fill();
  });

  ctx.beginPath();
  ctx.moveTo(...p(124, 642));
  ctx.lineTo(...p(476, 642));
  ctx.lineTo(...p(476, 620));
  ctx.lineTo(...p(124, 620));
  ctx.closePath();
  const ribGrad = ctx.createLinearGradient(...p(300, 620), ...p(300, 642));
  ribGrad.addColorStop(0, adjustColour(colour, -8));
  ribGrad.addColorStop(1, adjustColour(colour, -20));
  ctx.fillStyle = ribGrad;
  ctx.fill();
  ribTexture(ctx, ...p(172, 633), ...p(428, 633), 16);

  ctx.beginPath();
  ctx.moveTo(...p(300, 98));
  ctx.bezierCurveTo(...p(298, 250), ...p(297, 420), ...p(300, 610));
  ctx.strokeStyle = 'rgba(15,13,11,0.06)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawCap(ctx, W, H, colour) {
  const p = (x, y) => [x * W / 600, y * H / 700];

  drawStudioBackdrop(ctx, W, H);
  drawGroundShadow(ctx, W, H, 0.5, 0.89, 0.38, 0.044);

  ctx.save();

  function crownPath() {
    ctx.beginPath();
    ctx.moveTo(...p(100, 420));
    ctx.bezierCurveTo(...p(95, 316), ...p(110, 156), ...p(300, 80));
    ctx.bezierCurveTo(...p(490, 156), ...p(505, 316), ...p(500, 420));
    ctx.closePath();
  }

  const grad = ctx.createLinearGradient(W * 0.1, H * 0.08, W * 0.88, H * 0.65);
  grad.addColorStop(0,    adjustColour(colour, 26));
  grad.addColorStop(0.35, adjustColour(colour, 10));
  grad.addColorStop(0.68, colour);
  grad.addColorStop(1,    adjustColour(colour, -28));

  crownPath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  crownPath();
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';

  const [lsx, lsy] = p(155, 320);
  let lShad = ctx.createRadialGradient(lsx, lsy, 0, lsx, lsy, W * 0.18);
  lShad.addColorStop(0, 'rgba(0,0,0,0.26)');
  lShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lShad; ctx.fillRect(0, 0, W, H);

  const [rsx, rsy] = p(445, 320);
  let rShad = ctx.createRadialGradient(rsx, rsy, 0, rsx, rsy, W * 0.18);
  rShad.addColorStop(0, 'rgba(0,0,0,0.26)');
  rShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rShad; ctx.fillRect(0, 0, W, H);

  const [bjx, bjy] = p(300, 440);
  let bjShad = ctx.createRadialGradient(bjx, bjy, 0, bjx, bjy, W * 0.34);
  bjShad.addColorStop(0, 'rgba(0,0,0,0.30)');
  bjShad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bjShad; ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'screen';
  const [hlx, hly] = p(240, 190);
  let hl = ctx.createRadialGradient(hlx, hly, 0, hlx, hly, W * 0.22);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  softEdgeShade(ctx, crownPath);

  ctx.save();
  ctx.strokeStyle = 'rgba(15,13,11,0.15)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(...p(300, 80));
  ctx.bezierCurveTo(...p(300, 148), ...p(300, 300), ...p(300, 424));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(15,13,11,0.10)';
  ctx.beginPath();
  ctx.moveTo(...p(300, 80));
  ctx.bezierCurveTo(...p(254, 130), ...p(212, 242), ...p(202, 426));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...p(300, 80));
  ctx.bezierCurveTo(...p(346, 130), ...p(388, 242), ...p(398, 426));
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(...p(100, 420));
  ctx.bezierCurveTo(...p(150, 436), ...p(248, 444), ...p(300, 444));
  ctx.bezierCurveTo(...p(352, 444), ...p(450, 436), ...p(500, 420));
  ctx.bezierCurveTo(...p(450, 430), ...p(352, 437), ...p(300, 437));
  ctx.bezierCurveTo(...p(248, 437), ...p(150, 430), ...p(100, 420));
  ctx.closePath();
  const [sbx, sby] = p(300, 428);
  const sweatband = ctx.createRadialGradient(sbx, sby, 0, sbx, sby, W * 0.3);
  sweatband.addColorStop(0, adjustColour(colour, -14));
  sweatband.addColorStop(1, adjustColour(colour, -6));
  ctx.fillStyle = sweatband;
  ctx.fill();
  ribTexture(ctx, ...p(155, 430), ...p(445, 430), 12);

  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.636, W * 0.45, H * 0.088, 0, 0, Math.PI);
  const brimTop = ctx.createLinearGradient(W * 0.05, H * 0.57, W * 0.95, H * 0.70);
  brimTop.addColorStop(0, adjustColour(colour, -10));
  brimTop.addColorStop(0.45, adjustColour(colour, -4));
  brimTop.addColorStop(1, adjustColour(colour, -22));
  ctx.fillStyle = brimTop;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,13,11,0.14)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.648, W * 0.442, H * 0.074, 0, 0.04, Math.PI - 0.04);
  ctx.strokeStyle = 'rgba(15,13,11,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.655, W * 0.44, H * 0.07, 0, 0, Math.PI);
  ctx.fillStyle = adjustColour(colour, -36);
  ctx.fill();

  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(15,13,11,0.18)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.626, W * 0.432, H * 0.082, 0, 0.06, Math.PI - 0.06);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(...p(300, 82), W * 0.021, 0, Math.PI * 2);
  const btnGrad = ctx.createRadialGradient(...p(297, 79), 0, ...p(300, 82), W * 0.022);
  btnGrad.addColorStop(0, adjustColour(colour, 4));
  btnGrad.addColorStop(1, adjustColour(colour, -32));
  ctx.fillStyle = btnGrad;
  ctx.fill();

  ctx.restore();
}

// ── Draw print area guide ────────────────────────────────────────────────────
function drawPrintArea(canvas, product, view) {
  const ctx = canvas.getContext('2d');
  const pa = getPrintAreaPx(canvas, product, view);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(0,80,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pa.x, pa.y, pa.w, pa.h);
  ctx.setLineDash([]);
  ctx.font = `${Math.round(canvas.width * 0.018)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = 'rgba(0,80,255,0.38)';
  ctx.textAlign = 'center';
  ctx.fillText('PRINT ZONE', pa.x + pa.w / 2, pa.y - canvas.height * 0.013);
  ctx.restore();
}

// ── Draw one free-placed design layer, with selection handles when active ────
function drawDesignLayer(canvas, img, x, y, w, h, isSelected) {
  if (!img || w <= 0 || h <= 0) return;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.drawImage(img, x, y, w, h);
  if (isSelected) {
    ctx.strokeStyle = 'rgba(0,80,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.setLineDash([]);
    const hs = 7;
    [[x,y],[x+w/2,y],[x+w,y],[x,y+h/2],[x+w,y+h/2],[x,y+h],[x+w/2,y+h],[x+w,y+h]].forEach(([hx,hy]) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
      ctx.strokeStyle = 'rgba(0,80,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - hs/2, hy - hs/2, hs, hs);
    });
  }
  ctx.restore();
}

// ── Draw uploaded design on canvas ──────────────────────────────────────────
function drawDesign(canvas, product, designImg, designState, view) {
  if (!designImg) return;
  const ctx = canvas.getContext('2d');
  const pa = getPrintAreaPx(canvas, product, view);
  const maxW = pa.w * designState.scale;
  const ratio = designImg.height / designImg.width;
  const dw = maxW;
  const dh = maxW * ratio;

  if (!designState.positionLocked) {
    const positions = {
      'top-left':   { x: pa.x,                y: pa.y },
      'top-center': { x: pa.x + (pa.w - dw) / 2, y: pa.y },
      'top-right':  { x: pa.x + pa.w - dw,    y: pa.y },
      'mid-left':   { x: pa.x,                y: pa.y + (pa.h - dh) / 2 },
      'center':     { x: pa.x + (pa.w - dw) / 2, y: pa.y + (pa.h - dh) / 2 },
      'mid-right':  { x: pa.x + pa.w - dw,    y: pa.y + (pa.h - dh) / 2 },
      'bot-left':   { x: pa.x,                y: pa.y + pa.h - dh },
      'bot-center': { x: pa.x + (pa.w - dw) / 2, y: pa.y + pa.h - dh },
      'bot-right':  { x: pa.x + pa.w - dw,    y: pa.y + pa.h - dh },
    };
    const coords = positions[designState.position] || positions['center'];
    designState.x = coords.x;
    designState.y = coords.y;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pa.x, pa.y, pa.w, pa.h);
  ctx.clip();
  ctx.drawImage(designImg, designState.x, designState.y, dw, dh);
  ctx.restore();

  designState.w = dw;
  designState.h = dh;
}

// ── Init page ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initScrollObserver();
});
