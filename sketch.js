// PANIC BLOB + MISCHIEF MAP (p5.js)
// Drop-in replacement sketch.

let blob = {
  x: 240,
  y: 160,
  vx: 0,
  vy: 0,

  r: 28,
  points: 64,

  wobble: 10,
  wobbleFreq: 1.1,

  t: 0,
  tSpeed: 0.02,

  // panic knobs
  panic: 0.0,       // 0..1 (rises near "threat")
  jitter: 0.0,      // screen-space shake amount
  dartTimer: 0,     // time until next sudden dart
  dirA: 0,          // current movement heading
};

let crates = [];
let coins = [];
let threat = { x: 380, y: 90, r: 45 }; // invisible "scary zone"
let stolen = 0;

function setup() {
  createCanvas(480, 320);
  noStroke();
  textFont("sans-serif");
  textSize(14);

  // Small map objects
  for (let i = 0; i < 6; i++) crates.push(makeCrate());
  for (let i = 0; i < 12; i++) coins.push(makeCoin());
}

function draw() {
  // --- Environment (panic vibe) ---
  background(238);

  // threat proximity drives panic
  const dThreat = dist(blob.x, blob.y, threat.x, threat.y);
  const targetPanic = constrain(map(dThreat, 160, 40, 0, 1), 0, 1);
  blob.panic = lerp(blob.panic, targetPanic, 0.08);

  // panic increases jitter + speed + wobble speed
  const speedBoost = lerp(1.0, 2.4, blob.panic);
  blob.tSpeed = lerp(0.012, 0.05, blob.panic);
  blob.wobble = lerp(7, 16, blob.panic);
  blob.wobbleFreq = lerp(0.8, 1.6, blob.panic);

  // tiny camera shake (panic)
  blob.jitter = lerp(blob.jitter, blob.panic * 6, 0.12);
  const camX = random(-blob.jitter, blob.jitter);
  const camY = random(-blob.jitter, blob.jitter);

  push();
  translate(camX, camY);

  // --- Draw map floor ---
  drawFloor();

  // --- Crates + coins ---
  for (const c of crates) drawCrate(c);
  for (const coin of coins) drawCoin(coin);

  // --- Blob behavior: twitchy darts + avoidance ---
  blob.t += blob.tSpeed;

  // If close to threat, blob tries to flee (avoid vector)
  let ax = 0;
  let ay = 0;

  // flee force
  const flee = fleeForce(threat, blob.x, blob.y);
  ax += flee.x * blob.panic * 0.9;
  ay += flee.y * blob.panic * 0.9;

  // random darting
  blob.dartTimer -= deltaTime;
  if (blob.dartTimer <= 0) {
    blob.dirA = random(TAU);
    // more frequent darts as panic rises
    const minMs = lerp(700, 200, blob.panic);
    const maxMs = lerp(1400, 420, blob.panic);
    blob.dartTimer = random(minMs, maxMs);
  }

  // dart acceleration (twitchy)
  ax += cos(blob.dirA) * 0.25 * speedBoost;
  ay += sin(blob.dirA) * 0.25 * speedBoost;

  // mouse can "spook" it too (optional)
  if (mouseIsPressed) {
    const m = { x: mouseX - camX, y: mouseY - camY, r: 30 };
    const mf = fleeForce(m, blob.x, blob.y);
    ax += mf.x * 0.9;
    ay += mf.y * 0.9;
  }

  // integrate
  blob.vx = (blob.vx + ax) * 0.92;
  blob.vy = (blob.vy + ay) * 0.92;
  blob.x += blob.vx;
  blob.y += blob.vy;

  // wall bounce
  bounceInBounds(20);

  // --- Mischief: bump crates (push them) ---
  for (const c of crates) bumpObject(c);

  // --- Mischief: steal coins (magnet + pickup) ---
  for (const coin of coins) stealCoin(coin);

  // --- Draw blob (panic edge) ---
  drawBlob();

  pop(); // end camera shake

  // --- UI overlay (tunnel vision vignette) ---
  drawVignette(blob.panic);

  fill(0);
  text(`Emotion: PANIC  |  Stolen: ${stolen}  |  Hold mouse to spook`, 10, 18);
  text(`Tip: Move near top-right to increase panic`, 10, 36);
}

/* ----------------- Drawing ----------------- */

function drawFloor() {
  // subtle grid + pulse rings near threat
  push();
  noFill();
  stroke(0, 0, 0, 18);
  for (let x = 0; x <= width; x += 24) line(x, 0, x, height);
  for (let y = 0; y <= height; y += 24) line(0, y, width, y);

  // pulse rings when panic is high
  const pulse = (sin(frameCount * 0.1) * 0.5 + 0.5) * blob.panic;
  stroke(255, 80, 80, 90 * blob.panic);
  for (let i = 0; i < 3; i++) {
    const rr = threat.r + i * 22 + pulse * 30;
    ellipse(threat.x, threat.y, rr * 2, rr * 2);
  }
  pop();
}

function drawCrate(c) {
  push();
  rectMode(CENTER);
  noStroke();
  fill(120, 95, 70);
  rect(c.x, c.y, c.s, c.s, 6);
  fill(255, 255, 255, 40);
  rect(c.x, c.y, c.s - 10, c.s - 10, 4);
  pop();
}

function drawCoin(coin) {
  if (!coin.alive) return;
  push();
  noStroke();
  fill(255, 200, 40);
  ellipse(coin.x, coin.y, coin.r * 2);
  fill(255, 255, 255, 60);
  ellipse(coin.x - 2, coin.y - 3, coin.r * 1.1);
  pop();
}

function drawBlob() {
  // color shifts slightly with panic
  const baseR = 20;
  const baseG = lerp(140, 70, blob.panic);
  const baseB = lerp(255, 90, blob.panic);

  // trembling outline via extra noise channel
  fill(baseR, baseG, baseB);
  beginShape();
  for (let i = 0; i < blob.points; i++) {
    const a = (i / blob.points) * TAU;

    const n = noise(
      cos(a) * blob.wobbleFreq + 100,
      sin(a) * blob.wobbleFreq + 100,
      blob.t
    );

    // extra "tremor" as panic rises
    const trem = (noise(i * 0.12, blob.t * 6) - 0.5) * blob.panic * 8;

    const r = blob.r + map(n, 0, 1, -blob.wobble, blob.wobble) + trem;

    vertex(blob.x + cos(a) * r, blob.y + sin(a) * r);
  }
  endShape(CLOSE);

  // tiny eye dot (makes mischief feel intentional)
  fill(0, 120);
  const eyeA = atan2(blob.vy, blob.vx);
  ellipse(blob.x + cos(eyeA) * 8, blob.y + sin(eyeA) * 8, 4, 4);
}

function drawVignette(p) {
  // simple vignette with rectangles (fast, no shader)
  const alpha = 140 * p;
  noStroke();
  fill(0, alpha);
  rect(0, 0, width, 18);
  rect(0, height - 18, width, 18);
  rect(0, 0, 18, height);
  rect(width - 18, 0, 18, height);

  // stronger corners
  fill(0, alpha * 0.9);
  rect(0, 0, 60, 60);
  rect(width - 60, 0, 60, 60);
  rect(0, height - 60, 60, 60);
  rect(width - 60, height - 60, 60, 60);
}

/* ----------------- Mischief Physics ----------------- */

function bumpObject(obj) {
  // obj: {x,y,vx,vy,s}
  const minDist = blob.r + obj.s * 0.55;
  const dx = obj.x - blob.x;
  const dy = obj.y - blob.y;
  const d = sqrt(dx * dx + dy * dy);

  if (d < minDist) {
    // push direction
    const nx = dx / max(d, 0.001);
    const ny = dy / max(d, 0.001);
    const overlap = (minDist - d);

    // move crate out + add velocity (bump)
    obj.x += nx * overlap * 0.6;
    obj.y += ny * overlap * 0.6;
    obj.vx += nx * 0.8 * (0.5 + blob.panic);
    obj.vy += ny * 0.8 * (0.5 + blob.panic);

    // blob recoils slightly
    blob.vx -= nx * 0.25;
    blob.vy -= ny * 0.25;
  }

  // integrate crate motion + friction + bounds
  obj.vx *= 0.88;
  obj.vy *= 0.88;
  obj.x += obj.vx;
  obj.y += obj.vy;
  obj.x = constrain(obj.x, 20, width - 20);
  obj.y = constrain(obj.y, 20, height - 20);
}

function stealCoin(coin) {
  if (!coin.alive) return;

  // "magnet" radius increases when panic rises (more chaotic stealing)
  const magnetR = lerp(28, 70, blob.panic);
  const dx = blob.x - coin.x;
  const dy = blob.y - coin.y;
  const d = sqrt(dx * dx + dy * dy);

  if (d < magnetR) {
    const pull = map(d, magnetR, 0, 0.02, 0.16);
    coin.x += dx * pull;
    coin.y += dy * pull;
  }

  // pickup
  if (d < blob.r * 0.75) {
    coin.alive = false;
    stolen++;
  }
}

/* ----------------- Helpers ----------------- */

function makeCrate() {
  return {
    x: random(60, width - 60),
    y: random(60, height - 60),
    vx: 0,
    vy: 0,
    s: random(22, 34),
  };
}

function makeCoin() {
  return {
    x: random(30, width - 30),
    y: random(30, height - 30),
    r: 6,
    alive: true,
  };
}

function bounceInBounds(pad) {
  if (blob.x < pad) { blob.x = pad; blob.vx *= -0.8; }
  if (blob.x > width - pad) { blob.x = width - pad; blob.vx *= -0.8; }
  if (blob.y < pad) { blob.y = pad; blob.vy *= -0.8; }
  if (blob.y > height - pad) { blob.y = height - pad; blob.vy *= -0.8; }
}

function fleeForce(circle, x, y) {
  const dx = x - circle.x;
  const dy = y - circle.y;
  const d = sqrt(dx * dx + dy * dy);
  if (d > circle.r + 90) return { x: 0, y: 0 };
  const nx = dx / max(d, 0.001);
  const ny = dy / max(d, 0.001);
  // push away from circle center
  return { x: nx * 1.0, y: ny * 1.0 };
}
