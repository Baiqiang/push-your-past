// 彩蛋：标题页 / 选关页偶尔跑过一个赤膊、红头巾的突击兵，把秘籍“按”一遍：
//   上上（举枪朝天）、下下（卧倒）、左右左右（转身）、B（散弹枪开火）、A（空翻），落地后头顶冒出奖章 ×30。
// 造型和动作是对魂斗罗的致敬，用矢量线条重新画的，不使用原作素材。解锁提示之后，它只会跑过去翻个跟头。

type Kind = 'stand' | 'run' | 'aim' | 'prone' | 'tuck';
interface Pose {
  kind: Kind;
  x: number;
  lift: number;
  flip: boolean;
  rot: number;
  phase: number;
  fire: boolean;
}
interface Step {
  dur: number;
  at(t: number): Pose;
}

const C = {
  skin: '#f2b48a',
  skinDark: '#c98a62',
  hair: '#2b1a10',
  band: '#ff3d5a',
  pants: '#3d6bff',
  belt: '#5a3b20',
  boot: '#3a2618',
  gun: '#c9d4ff',
  gold: '#ffd23f',
  white: '#ffffff',
  glow: 'rgba(61,232,255,0.55)',
};
const H = 210; // 画布高度（留出跳起来、举枪的空间）
const GROUND = H - 12;
type Ctx = CanvasRenderingContext2D;

function limb(ctx: Ctx, pts: number[], color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx: Ctx, x: number, y: number, R: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/** 头 + 红头巾，两条飘带随时间摆动 */
function head(ctx: Ctx, x: number, y: number, time: number): void {
  const w = Math.sin(time / 85);
  ctx.strokeStyle = C.band;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 3);
  ctx.quadraticCurveTo(x - 15, y - 2 + w * 3, x - 24, y + 1 + w * 6);
  ctx.moveTo(x - 6, y - 2);
  ctx.quadraticCurveTo(x - 14, y + 3 - w * 2, x - 20, y + 8 - w * 5);
  ctx.stroke();
  dot(ctx, x, y, 7, C.skin);
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.arc(x - 1, y - 2, 7.2, Math.PI * 0.95, Math.PI * 2.02);
  ctx.fill();
  ctx.fillStyle = C.band;
  ctx.fillRect(x - 7.5, y - 4.5, 15, 3.5);
}

/**
 * 站着 / 跑着 / 举枪的身体，原点在两脚中间的地面上，面朝右。
 * legs：'stand' 站立，'together' 并腿（卧倒用），数字为跑步相位。返回枪口位置（本地坐标）。
 */
function body(ctx: Ctx, legs: number | 'stand' | 'together', up: boolean, time: number, fire: boolean): [number, number] {
  const hip = -30;
  for (const side of [-1, 1]) {
    let th: number;
    let sh: number;
    if (legs === 'stand') {
      th = side * 0.2;
      sh = side * 0.12;
    } else if (legs === 'together') {
      th = sh = side * 0.04;
    } else {
      const s = Math.sin(legs) * side;
      th = s * 0.75;
      sh = th - 0.25 - 0.5 * Math.max(0, Math.cos(legs) * side);
    }
    const kx = Math.sin(th) * 14;
    const ky = hip + Math.cos(th) * 14;
    const fx = kx + Math.sin(sh) * 14;
    const fy = ky + Math.cos(sh) * 14;
    limb(ctx, [side * 3, hip, kx + side, ky, fx, fy], C.pants, 8);
    ctx.fillStyle = C.boot;
    ctx.beginPath();
    ctx.ellipse(fx + 2.5, fy, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 赤膊上身
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.moveTo(-6, hip);
  ctx.lineTo(6, hip);
  ctx.lineTo(9.5, -50);
  ctx.lineTo(-8.5, -50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.skinDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4, -44);
  ctx.quadraticCurveTo(1, -41.5, 6, -44);
  ctx.moveTo(1, -40);
  ctx.lineTo(1, -33);
  ctx.stroke();
  ctx.fillStyle = C.belt;
  ctx.fillRect(-7, hip - 2, 14, 4);
  head(ctx, 1, -58, time);
  // 枪：平端或朝天
  const [dx, dy] = up ? [0, -1] : [1, 0];
  const px = -dy;
  const py = dx;
  const at = (k: number, o = 0): [number, number] => [2 + dx * k + px * o, -46 + dy * k + py * o];
  const h1 = at(7, 3);
  const h2 = at(17, 2);
  limb(ctx, [-4, -48, ...h1], C.skin, 5);
  limb(ctx, [...at(-2), ...at(31)], C.gun, 4.5);
  limb(ctx, [...at(12, 1), ...at(13, 7)], C.gun, 3);
  limb(ctx, [6, -48, ...h2], C.skin, 5);
  const muzzle = at(33);
  if (fire) {
    ctx.fillStyle = C.gold;
    star(ctx, muzzle[0] + dx * 3, muzzle[1] + dy * 3, 7, 3);
  }
  return muzzle;
}

/** 空翻时缩成一团：裤腿、手臂、头和头巾转成一个球 */
function ball(ctx: Ctx, time: number): void {
  dot(ctx, 0, 0, 15, C.pants);
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 15, Math.PI * 1.05, Math.PI * 1.75);
  ctx.closePath();
  ctx.fill();
  dot(ctx, -9, -10, 6.5, C.skin);
  ctx.fillStyle = C.band;
  ctx.fillRect(-15, -14, 12, 3);
  ctx.strokeStyle = C.band;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-15, -13);
  ctx.quadraticCurveTo(-22, -6 + Math.sin(time / 60) * 3, -26, 2);
  ctx.stroke();
  dot(ctx, 12, 8, 4, C.boot);
  dot(ctx, 6, 13, 4, C.boot);
}

/** 散弹枪的子弹：一次五发，扇形散开 */
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function medal(ctx: Ctx, x: number, y: number, a: number): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = C.band;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 16);
  ctx.lineTo(x + 7, y - 16);
  ctx.lineTo(x + 3, y - 6);
  ctx.lineTo(x - 3, y - 6);
  ctx.closePath();
  ctx.fill();
  dot(ctx, x, y + 2, 9, C.gold);
  ctx.fillStyle = C.white;
  star(ctx, x, y + 2, 6, 2.6);
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 18px Orbitron, monospace';
  ctx.fillText('×30', x + 14, y + 8);
  ctx.globalAlpha = 1;
}

// ---- 动作编排 ----
const pose = (kind: Kind, x: number, o: Partial<Pose> = {}): Pose => ({ kind, x, lift: 0, flip: false, rot: 0, phase: 0, fire: false, ...o });
const run = (from: number, to: number, ms: number): Step => ({
  dur: ms,
  at: (t) => pose('run', from + (to - from) * t, { flip: to < from, phase: (t * ms) / 70 }),
});
const hold = (kind: Kind, x: number, ms: number, o: Partial<Pose> = {}): Step => ({ dur: ms, at: () => pose(kind, x, o) });
/** 魂斗罗式空翻：缩成球转一圈 */
const flipJump = (x: number, ms = 640): Step => ({
  dur: ms,
  at: (t) => (t < 0.06 || t > 0.94 ? pose('stand', x) : pose('tuck', x, { lift: Math.sin(t * Math.PI) * 80, rot: t * Math.PI * 4 })),
});

function routine(W: number, full: boolean) {
  const mid = Math.round(W * 0.42);
  const steps: Step[] = [run(-60, mid, 1500), hold('stand', mid, 420)];
  let fireFrom = -1;
  let medalAt = -1;
  if (full) {
    // 上 上：举枪朝天
    steps.push(hold('aim', mid, 360), hold('stand', mid, 160), hold('aim', mid, 360), hold('stand', mid, 240));
    // 下 下：卧倒
    steps.push(hold('prone', mid, 380), hold('stand', mid, 160), hold('prone', mid, 380), hold('stand', mid, 260));
    // 左 右 左 右：转身
    for (const flip of [true, false, true, false]) steps.push(hold('stand', mid, 300, { flip }));
    steps.push(hold('stand', mid, 160));
    // B：散弹枪
    fireFrom = steps.length;
    steps.push(hold('stand', mid, 520, { fire: true }), hold('stand', mid, 200));
    // A：空翻，落地后冒出奖章 ×30
    steps.push(flipJump(mid));
    medalAt = steps.length;
    steps.push(hold('stand', mid, 1800));
  } else {
    steps.push(flipJump(mid), hold('stand', mid, 260));
  }
  steps.push(run(mid, W + 60, 1500));
  return { steps, fireFrom, medalAt };
}

/**
 * 启动彩蛋。isIdle() 为真（标题页或选关页在前台，没有弹窗）时，隔一阵跑一次。
 * unlocked() 为真时只跑简短版。
 */
export function startCommando(isIdle: () => boolean, unlocked: () => boolean): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const cvs = document.createElement('canvas');
  cvs.className = 'commando';
  cvs.setAttribute('aria-hidden', 'true');
  document.body.append(cvs);
  const ctx = cvs.getContext('2d');
  if (!ctx) return;
  let busy = false;

  const play = () => {
    busy = true;
    const W = window.innerWidth;
    const scale = W < 600 ? 0.8 : 1.1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = W * dpr;
    cvs.height = H * dpr;
    cvs.style.height = H + 'px';
    cvs.classList.add('on');
    const { steps, fireFrom, medalAt } = routine(W, !unlocked());
    const ends: number[] = [];
    steps.reduce((acc, s) => (ends.push(acc + s.dur), acc + s.dur), 0);
    const t0 = performance.now();
    let bullets: Bullet[] = [];
    let volley = 0;
    let medalT = -1;
    let last = t0;

    const frame = (now: number) => {
      const el = now - t0;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      if (!isIdle() || el >= ends[ends.length - 1]) return finish();
      let i = 0;
      while (ends[i] <= el) i++;
      const s = steps[i];
      const start = i > 0 ? ends[i - 1] : 0;
      const p = s.at((el - start) / s.dur);
      if (i === medalAt && medalT < 0) medalT = el;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = C.glow;
      ctx.shadowBlur = 10;

      ctx.save();
      ctx.translate(p.x, GROUND - p.lift);
      ctx.scale(scale * (p.flip ? -1 : 1), scale);
      let muzzle: [number, number] | null = null;
      if (p.kind === 'tuck') {
        ctx.translate(0, -24);
        ctx.rotate(p.rot);
        ball(ctx, el);
      } else if (p.kind === 'prone') {
        // 卧倒：整个人向前躺平，枪口贴地朝前
        ctx.translate(-30, -10);
        ctx.rotate(Math.PI / 2);
        body(ctx, 'together', true, el, false);
      } else {
        muzzle = body(ctx, p.kind === 'run' ? p.phase : 'stand', p.kind === 'aim', el, p.fire && Math.floor(el / 70) % 2 === 0);
      }
      // 枪口在屏幕上的位置（用于发射子弹）
      const m = muzzle ? ctx.getTransform().transformPoint(new DOMPoint(muzzle[0], muzzle[1])) : null;
      ctx.restore();

      // B：每隔一会儿打出一轮五发扇形散弹
      if (i === fireFrom && m) {
        const n = Math.floor((el - start) / 170);
        while (volley <= n) {
          for (const a of [-0.32, -0.16, 0, 0.16, 0.32]) bullets.push({ x: m.x / dpr, y: m.y / dpr, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620 });
          volley++;
        }
      }
      ctx.shadowColor = 'rgba(255,61,90,0.9)';
      for (const b of bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        dot(ctx, b.x, b.y, 4, C.band);
        dot(ctx, b.x, b.y, 2, C.white);
      }
      bullets = bullets.filter((b) => b.x < W + 10 && b.y > -10 && b.y < H + 10);

      if (medalT >= 0) {
        const mt = (el - medalT) / 1000;
        const a = Math.min(1, mt * 4) * Math.max(0, 1 - Math.max(0, mt - 1.4) * 2.5);
        ctx.shadowColor = 'rgba(255,210,63,0.8)';
        medal(ctx, p.x - 6, GROUND - 100 * scale - Math.min(mt, 0.4) * 30, a);
      }
      requestAnimationFrame(frame);
    };
    const finish = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      cvs.classList.remove('on');
      busy = false;
      schedule(14000 + Math.random() * 10000);
    };
    requestAnimationFrame(frame);
  };

  const schedule = (ms: number) =>
    window.setTimeout(() => {
      if (busy) return;
      if (!isIdle() || document.hidden) return schedule(3000);
      play();
    }, ms);
  schedule(4500);
}
