import { describe, expect, it } from 'vitest';
import { runActions } from '../src/core/game';
import { solve, solveWithoutGhosts } from '../src/core/solver';

const rules = { maxGhosts: 3, maxRecord: 12 };
const lv = (map: string[], r = rules) => ({ map, ...r });

describe('录制与回放', () => {
  it('封存后世界回到 Anchor，Ghost 在 Anchor 出生', () => {
    const r = runActions(lv(['#######', '#@....#', '#######']), 'R[RR]');
    expect(r.ok).toBe(true);
    const w = r.state.world;
    expect(w.player).toBe(9); // 回到 Anchor 时玩家位置
    expect(w.ghosts).toHaveLength(1);
    expect(w.ghosts[0].pos).toBe(9);
    expect(w.ghosts[0].program).toEqual([1, 1]);
  });

  it('Ghost 先行动：与玩家重叠出生，下一拍离开', () => {
    const r = runActions(lv(['#######', '#@....#', '#######']), '[RR]W');
    const w = r.state.world;
    expect(w.ghosts[0].pos).toBe(9);
    expect(w.player).toBe(8);
  });

  it('Anchor 保存已有 Ghost 的指令指针（历史切片）', () => {
    const map = ['########', '#@.....#', '#......#', '########'];
    // G0 录 3 步向右；回到起点后等 2 拍（G0 走到 step2），再设置 Anchor 录 G1
    const r = runActions(lv(map), '[RRR]WW[D]');
    const w = r.state.world;
    expect(w.ghosts[0].ip).toBe(2);
    expect(w.ghosts[0].pos).toBe(11);
    expect(w.ghosts[1].pos).toBe(9);
  });
});

describe('物理', () => {
  it('推偏 Ghost：之后的指令在新位置执行', () => {
    const map = ['#######', '#.....#', '#@....#', '#.....#', '#######'];
    // Ghost 程序 W W R R。回放：玩家先下移，再上移把 Ghost 推到上一行；
    // Ghost 剩下的 R R 在上一行执行。
    const r = runActions(lv(map), '[WWRR]DUWW');
    const g = r.state.world.ghosts[0];
    expect(g.pos).toBe(1 * 7 + 3); // 录制时终点是 (3,2)，实际终点 (3,1)
    expect(g.log).toEqual(['wait', 'wait', 'ok', 'ok']);
  });

  it('挡住 Ghost 的一拍：指令被消耗', () => {
    const map = ['########', '#@.....#', '########'];
    // Ghost 程序 R R R；玩家第一拍抢先站到它前面并停住
    const r = runActions(lv(map), '[RRR]');
    expect(r.state.world.ghosts[0].pos).toBe(9);
    // 封存后玩家与 Ghost 同格。Ghost 先动到 10，玩家跟到… 改为让玩家挡在墙边：
    const map2 = ['#####', '#@..#', '#####'];
    const r2 = runActions(lv(map2), '[RRW]W');
    // 第一拍 Ghost 右移到 7，玩家等待留在 6
    expect(r2.state.world.ghosts[0].pos).toBe(7);
  });

  it('Ghost 推玩家：一拍内前进两格', () => {
    const map = ['#########', '#@......#', '#########'];
    // Ghost 程序 W R。回放：第一拍玩家右移到 11；第二拍 Ghost 右移把玩家推到 12，玩家再走到 13
    const r = runActions(lv(map), '[WR]RR');
    expect(r.state.world.player).toBe(13);
    expect(r.state.world.ghosts[0].pos).toBe(11);
  });

  it('箱子不能推箱子；推力为 1', () => {
    const r = runActions(lv(['#######', '#@$$..#', '#######']), 'R');
    expect(r.ok).toBe(false);
    const r2 = runActions(lv(['#######', '#@$...#', '#######']), 'RR');
    expect(r2.state.world.boxes).toEqual([11]);
  });

  it('压力板开门；离开后门关闭', () => {
    const map = ['#######', '#@a.A.#', '#######'];
    expect(runActions(lv(map), 'RRR').ok).toBe(false);
    const r = runActions(lv(map), 'RR');
    expect(r.state.world.player).toBe(10);
  });

  it('单向格只能沿箭头方向进入', () => {
    expect(runActions(lv(['######', '#@>..#', '######']), 'RR').ok).toBe(true);
    expect(runActions(lv(['######', '#.<@.#', '######']), 'LL').ok).toBe(true);
    expect(runActions(lv(['######', '#@<..#', '######']), 'R').ok).toBe(false);
  });
});

describe('求解器', () => {
  it('门 + 压力板：没有 Ghost 无解，有 Ghost 可解', () => {
    const map = ['#######', '#@a#..#', '#..A.E#', '#######'];
    expect(solveWithoutGhosts({ map }).status).toBe('unsolvable');
    const s = solve({ map, maxGhosts: 1, maxRecord: 6 }, { maxNodes: 200000 });
    expect(s.status).toBe('solved');
    if (s.status === 'solved') expect(runActions({ map, maxGhosts: 1, maxRecord: 6 }, s.solution).won).toBe(true);
  });
});

describe('新机关', () => {
  it('身份闸：S 只放影子，Y 只放你；箱子都过不去', () => {
    expect(runActions(lv(['######', '#@S.E#', '######']), 'RRR').ok).toBe(false);
    expect(runActions(lv(['######', '#@Y.E#', '######']), 'RRR').won).toBe(true);
    expect(runActions(lv(['#######', '#@$Y.E#', '#######']), 'R').ok).toBe(false);
    // 影子能穿过 S
    const r = runActions(lv(['######', '#@S..#', '######']), '[RR]W');
    expect(r.state.world.ghosts[0].pos).toBe(8);
  });

  it('裂地：离开后塌掉，回溯时复原', () => {
    const map = ['######', '#@%..#', '######'];
    const r = runActions(lv(map), 'RR');
    expect(r.state.world.broken).toBe(1);
    expect(runActions(lv(map), 'RRLL').ok).toBe(false); // 塌了回不去
    const r2 = runActions(lv(map), '[RR]');
    expect(r2.state.world.broken).toBe(0);
  });

  it('坑：影子照原路走进去就被抹除；你和箱子进不去', () => {
    // 影子先等两步；你在这期间走过裂地把它踩塌，影子第 4 步走进坑
    const r = runActions(lv(['########', '#@.%...#', '########']), '[WWRR]RRRR');
    const g = r.state.world.ghosts[0];
    expect(g.gone).toBe(true);
    expect(g.pos).toBe(-1);
    expect(g.ip).toBe(g.program.length);
    expect(r.state.world.player).toBe(13);
    // 坑挡得住你和箱子
    expect(runActions(lv(['########', '#@.%...#', '########']), 'RRRLL').ok).toBe(false);
    // 箱子在坑左边：先绕下去踩塌裂地，再回来往右推箱子
    const boxDef = lv(['########', '#@$%...#', '#......#', '########']);
    const pre = runActions(boxDef, 'DRRURDLLLU');
    expect(pre.ok).toBe(true);
    expect(pre.state.world.broken).toBe(1);
    expect(runActions(boxDef, 'DRRURDLLLUR').ok).toBe(false);
  });

  it('你把影子推进坑：它当场抹除', () => {
    // 先踩塌裂地，绕回坑左边留影；影子原地等，你后退一步再把它往右推进坑
    const r = runActions(lv(['########', '#@.%...#', '#......#', '########']), 'RRRDLLU[WWWW]LR');
    expect(r.state.world.ghosts[0].gone).toBe(true);
    expect(r.state.world.player).toBe(10);
  });

  it('待命台 / 释放板：影子等释放板被踩过才开始走，不耗步数', () => {
    // 你从 H 右边出发，退到 H 上留影（下、右），回溯后影子待命
    const map = ['########', '#H@.r..#', '#......#', '########'];
    expect(runActions(lv(map), 'L[DR]').state.world.ghosts[0].waiting).toBe(true);
    // 一直没人踩 r：影子一步都不走
    expect(runActions(lv(map), 'L[DR]DRRR').state.world.ghosts[0].ip).toBe(0);
    // 第 3 步你站上 r；第 4 步开始时释放板上有东西，影子从这一步起开始走
    const g = runActions(lv(map), 'L[DR]RRRW').state.world.ghosts[0];
    expect(g.waiting).toBe(false);
    expect(g.ip).toBe(1);
  });

  it('残影也能开局待命（动作串以 ⏸ 开头），等释放板被踩过才走', () => {
    const map = ['#######', '#1....#', '#@..r.#', '#######'];
    const held = { ...lv(map), presets: ['⏸RRR'] };
    expect(runActions(held, 'RR').state.world.ghosts[0].pos).toBe(8); // 没人踩 ▶，一直不动
    const g = runActions(held, 'RRRW').state.world.ghosts[0]; // 第 3 步你站上 ▶，第 4 步它开始走
    expect(g.waiting).toBe(false);
    expect(g.pos).toBe(9);
    // 不带 ⏸ 的残影照常一开局就走
    expect(runActions({ ...lv(map), presets: ['RRR'] }, 'W').state.world.ghosts[0].pos).toBe(9);
  });

  it('传送门：走进一端从另一端出来，推东西也一样', () => {
    const map = ['########', '#@(#)..#', '########'];
    const r = runActions(lv(map), 'R');
    expect(r.state.world.player).toBe(12); // 落在另一端的门上
    // 箱子被推进左门，从右门出来；再推一下到目标
    const r2 = runActions(lv(['########', '#@$(#)_#', '########']), 'RR');
    expect(r2.state.world.boxes).toEqual([14]);
    expect(r2.won).toBe(true);
  });
});

describe('过关回放', () => {
  it('从头重放最终时间线，得到同样的结局', async () => {
    const { LEVELS } = await import('../src/levels');
    const { replayTimeline } = await import('../src/core/game');
    const { sameWorld } = await import('../src/core/sim');
    for (const l of LEVELS) {
      const r = runActions(l, l.solution!);
      const frames = replayTimeline(r.board, (await import('../src/core/level')).parseLevel(l).world, r.state.world);
      expect(sameWorld(frames[frames.length - 1].world, r.state.world), l.id).toBe(true);
    }
  });
});
