import { Action, ownGhosts, parseActions, replayTimeline, Session } from '../core/game';
import { starCount, stars, starText } from './stars';
import { GameState, LevelDef, WAIT } from '../core/types';
import { isReleasing, step } from '../core/sim';

const PREVIEW_STEPS = 5;
import { sfx } from '../audio/sfx';
import { bindInput, Command } from '../input/input';
import { BoardView } from '../render/board';
import { ghostColor, ghostNumber, hex, THEME } from '../render/theme';
import { clear, h, toast } from './dom';
import { renderTimeline } from './timeline';
import { levelHint, levelHints, levelName, t } from '../i18n';

export interface PlayHooks {
  onExit(): void;
  onWin(def: LevelDef, beats: number, ghosts: number): void;
  /** 这一关历史最好成绩（存档里的） */
  best(def: LevelDef): { beats: number; ghosts: number } | undefined;
  /** 返回下一关；没有则 null */
  nextLevel(def: LevelDef): LevelDef | null;
  muted(): boolean;
  setMuted(m: boolean): void;
  trails(): boolean;
  setTrails(t: boolean): void;
  controlsSeen(): boolean;
  /** 提示默认锁着，输入秘籍后才有 */
  hintsUnlocked(): boolean;
  markControlsSeen(): void;
}

const DENY_MSG = { 'ghost-limit': 'play.deny.ghosts', 'record-limit': 'play.deny.record' } as const;

export class PlayScreen {
  readonly el: HTMLElement;
  private boardHost: HTMLElement;
  private timeline: HTMLElement;
  private hint: HTMLElement;
  private title: HTMLElement;
  private hud: HTMLElement;
  private recBtn: HTMLElement;
  private modal: HTMLElement;
  private session: Session | null = null;
  private unbind: (() => void) | null = null;
  private demoTimer = 0;
  private restarts = 0;
  private back = '';
  /** 分步提示进度：已翻开几条文字提示、已演示到第几次回溯 */
  private hintShown = 0;
  private demoShown = 0;

  constructor(private view: BoardView, private hooks: PlayHooks) {
    const btn = (label: string, cmd: Command, cls = '', title = '') =>
      h('button.btn' + cls, { onclick: () => this.command(cmd), title, 'aria-label': title || label }, label);
    this.title = h('div.level-title');
    this.hud = h('div.hud', { 'aria-live': 'polite' });
    this.boardHost = h('div.board-wrap');
    this.timeline = h('div.timeline');
    this.hint = h('div.hint-bar');
    // 手机上关卡说明只露两行，点一下展开
    this.hint.addEventListener('click', () => this.hint.classList.toggle('open'));
    this.recBtn = btn(t('play.rec'), 'recToggle', '.rec', t('play.recTitle'));
    this.modal = h('div.modal-back');
    // 点遮罩关闭弹窗（通关弹窗除外）
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal && !this.modal.dataset.sticky) this.closeModal();
    });
    const soundBtn = h('button.btn.icon-btn', { title: t('play.sound'), 'aria-label': t('play.sound') });
    const updSound = () => (soundBtn.textContent = this.hooks.muted() ? '🔇' : '🔊');
    soundBtn.addEventListener('click', () => {
      this.hooks.setMuted(!this.hooks.muted());
      updSound();
    });
    updSound();

    this.el = h(
      'section.screen.play-screen',
      {},
      h(
        'div.topbar',
        {},
        h('button.btn.icon-btn', { onclick: () => this.exit(), title: t('play.back'), 'aria-label': t('play.back') }, '←'),
        this.title,
        h('button.btn.icon-btn.wide-only', { onclick: () => this.command('trails'), title: t('play.trails'), 'aria-label': t('play.trails') }, '⋯'),
        (this.previewBtn = h('button.btn.icon-btn.toggle', { onclick: () => this.command('preview'), title: t('play.preview'), 'aria-label': t('play.preview') }, '👁')),
        h('button.btn.icon-btn.hint-btn', { onclick: () => this.showHints(), title: t('play.help') + ' (H)', 'aria-label': t('play.help') }, '💡'),
        h('button.btn.icon-btn', { onclick: () => this.showControls(), title: t('controls.title'), 'aria-label': t('controls.title') }, '?'),
        soundBtn,
      ),
      h(
        'div.play-main',
        {},
        h('div.board-col', {}, this.hud, this.boardHost),
        h(
          'aside.side',
          {},
          h('h4', {}, t('play.side')),
          this.timeline,
          h('div.order', {}, t('play.order1'), h('b', {}, t('play.order2')), h('br'), t('play.order3')),
        ),
      ),
      this.hint,
      h(
        'div.controls',
        {},
        this.recBtn,
        btn(t('play.wait'), WAIT, '', t('play.waitTitle')),
        btn(t('play.undo'), 'undo', '', t('play.undo') + ' (Z)'),
        btn(t('play.restart'), 'restart', '', t('play.restart') + ' (R)'),
      ),
      this.modal,
    );
  }

  open(def: LevelDef, backLabel = t('play.back')): void {
    this.back = backLabel;
    this.session = new Session(def);
    this.restarts = 0;
    this.hintShown = 0;
    this.demoShown = 0;
    this.stopReplayListeners?.();
    this.stopReplayListeners = null;
    this.replaying = false;
    this.view.setOverlay(null);
    this.stopDemo();
    this.closeModal();
    this.view.attach(this.boardHost);
    this.view.setLevel(this.session.board);
    this.view.sync(this.session.state, [], true);
    clear(this.title);
    this.title.append(h('span.id', {}, def.chapter > 0 ? def.id : '★'), levelName(def));
    this.recBtn.style.display = def.maxGhosts > 0 ? '' : 'none';
    this.setHint(levelHint(def) ?? '');
    this.refresh();
    this.unbind?.();
    // 整个游戏界面都认滑动（不只是地图），手指落在哪都能走
    const off = bindInput(this.el, (c) => this.command(c), () => this.modal.classList.contains('show'));
    window.addEventListener('keydown', this.onModalKey);
    this.unbind = () => {
      off();
      window.removeEventListener('keydown', this.onModalKey);
    };
    // 只在第一次进游戏时自动弹操作说明，之后点右上角 ? 再看
    if (!this.hooks.controlsSeen()) this.showControls();
  }

  close(): void {
    this.stopReplayListeners?.();
    this.stopReplayListeners = null;
    this.replaying = false;
    this.view.setOverlay(null);
    this.stopDemo();
    this.unbind?.();
    this.unbind = null;
  }

  private exit(): void {
    this.close();
    this.hooks.onExit();
  }

  private setHint(text: string, flash = false): void {
    this.hint.textContent = text;
    this.hint.classList.toggle('flash', flash);
  }

  command(c: Command, fromDemo = false): void {
    const s = this.session;
    if (!s) return;
    if (this.replaying && !fromDemo) return this.endReplay();
    if (!fromDemo && this.demoTimer) this.stopDemo();
    if (this.modal.classList.contains('show')) {
      if (c === 'cancel' && !this.modal.dataset.sticky) this.closeModal();
      return;
    }
    switch (c) {
      case 'undo':
        if (s.undo()) {
          sfx.play('undo');
          this.view.sync(s.state, [], true);
        }
        return this.refresh();
      case 'restart':
        s.restart();
        this.restarts++;
        sfx.play('cancel');
        this.view.flash('rewind');
        this.view.sync(s.state, [], true);
        if (this.restarts >= 3) this.setHint(t(this.hooks.hintsUnlocked() ? 'play.stuck' : 'play.stuckLocked'), true);
        return this.refresh();
      case 'hint':
        return this.hooks.hintsUnlocked() ? this.showHints() : undefined;
      case 'trails':
        this.hooks.setTrails(!this.hooks.trails());
        this.view.showTrails = this.hooks.trails();
        this.view.sync(s.state, [], true);
        return;
      case 'preview':
        this.previewOn = !this.previewOn;
        return this.updatePreview();
      case 'previewOn':
      case 'previewOff':
        this.previewHeld = c === 'previewOn';
        return this.updatePreview();
      case 'mute':
        this.hooks.setMuted(!this.hooks.muted());
        return toast(this.boardHost, t(this.hooks.muted() ? 'play.muted' : 'play.unmuted'));
      case 'menu':
        return this.exit();
      case 'recToggle':
        if (!s.state.rec && s.def.maxGhosts === 0) return toast(this.boardHost, t('play.deny.noRec'));
        return this.act(s.state.rec ? 'seal' : 'rec');
      default:
        return this.act(c);
    }
  }

  private act(a: Action): void {
    const s = this.session!;
    const r = s.act(a);
    if (!r.ok) {
      if (r.reason === 'noop') sfx.play('bump');
      else if (r.reason !== 'not-recording') {
        sfx.play('deny');
        toast(this.boardHost, t(r.reason in DENY_MSG ? DENY_MSG[r.reason as keyof typeof DENY_MSG] : 'play.deny.other'));
      }
      return;
    }
    if (r.kind === 'rec') {
      sfx.play('rec');
      this.view.burstAt(s.state.world.player, THEME.recording, 14);
    } else if (r.kind === 'seal') {
      sfx.play('seal');
      this.view.flash('rewind');
      const g = s.state.world.ghosts[s.state.world.ghosts.length - 1];
      this.view.sync(s.state, [], true);
      this.view.burstAt(g.pos, ghostColor(g, s.state.world.ghosts), 24, 180);
    } else if (r.kind === 'cancel') {
      sfx.play('cancel');
      this.view.flash('rewind');
      this.view.sync(s.state, [], true);
    } else {
      const pushed = r.events.some((e) => e.t === 'move' && e.pushed);
      const doors = r.events.some((e) => e.t === 'door');
      const playerMoved = r.events.some((e) => e.t === 'move' && e.id === 'p' && !e.pushed);
      sfx.play(pushed ? 'push' : playerMoved || a === WAIT ? 'step' : 'bump');
      if (doors) sfx.play('door');
      if (r.events.some((e) => e.t === 'crack')) sfx.play('crack');
      if (r.events.some((e) => e.t === 'erase')) sfx.play('cancel');
      if (r.events.some((e) => e.t === 'release')) sfx.play('rec');
      if (r.events.some((e) => e.t === 'move' && e.via !== undefined)) sfx.play('portal');
      this.view.sync(s.state, r.events);
    }
    this.refresh();
    if (s.won) this.win();
  }

  private refresh(): void {
    const s = this.session!;
    const st = s.state;
    const rec = !!st.rec;
    this.recBtn.textContent = t(rec ? 'play.stop' : 'play.rec');
    this.recBtn.classList.toggle('on', rec);
    this.renderHud();
    renderTimeline(this.timeline, st, s.def.maxRecord, s.board);
    this.updatePreview();
  }

  /** 主区域上方的大号状态：已走几步、影子用了几个、每个影子走到哪、这段留影还剩几步 */
  private renderHud(override?: GameState): void {
    const s = this.session!;
    const st = override ?? s.state;
    const w = st.world;
    const stat = (label: string, value: string, cls = '', color?: string) =>
      h('div.hud-item' + cls, color ? { style: `--c:${color}` } : {}, h('div.hud-label', {}, label), h('div.hud-value', {}, value));
    clear(this.hud);
    this.hud.classList.toggle('rec', !!st.rec);
    this.hud.append(stat(t('hud.steps'), String(w.tick)));
    if (s.def.maxGhosts > 0) this.hud.append(stat(t('hud.shadows'), `${ownGhosts(w)} / ${s.def.maxGhosts}`));
    for (const g of w.ghosts) {
      const done = g.ip >= g.program.length;
      const label = t(g.preset ? 'play.echo' : 'play.shadow', { n: ghostNumber(g, w.ghosts) });
      const value = g.gone ? t('play.erased') : g.waiting ? t('play.waiting') : g.gated && g.ip < g.program.length && !isReleasing(s.board, w) ? t('play.paused') : done ? t('play.idle') : t('hud.ghostProgress', { a: g.ip, b: g.program.length });
      this.hud.append(stat(label, value, done ? '.dim' : '', hex(ghostColor(g, w.ghosts))));
    }
    if (st.rec) {
      const left = s.def.maxRecord - st.rec.inputs.length;
      this.hud.append(stat(t('hud.imprinting'), t('hud.left', { n: left }), '.big.rec' + (left <= 1 ? '.warn' : ''), hex(THEME.recording)));
    }
  }

  private win(): void {
    const s = this.session!;
    const beats = s.state.world.tick;
    const ghosts = ownGhosts(s.state.world);
    sfx.play('win');
    this.view.flash('win');
    this.view.burstAt(s.state.world.player, THEME.exit, 40, 240);
    this.hooks.onWin(s.def, beats, ghosts);
    this.winStats = { beats, ghosts };
    setTimeout(() => this.showWin(), 450);
  }

  private winStats = { beats: 0, ghosts: 0 };

  private showWin(): void {
    const s = this.session!;
    const { beats, ghosts } = this.winStats;
    const next = this.hooks.nextLevel(s.def);
    const par = s.def.par;
    const now = stars(par, { beats, ghosts });
    const best = stars(par, this.hooks.best(s.def) ?? { beats, ghosts });
    const goal = (ok: boolean, label: string) => h('div.goal' + (ok ? '.ok' : ''), {}, h('span.star', {}, ok ? '★' : '☆'), label);
    const hasOwn = s.state.world.ghosts.some((g) => !g.preset);
    this.openModal(
      h(
        'div.modal',
        { role: 'dialog', 'aria-label': t('win.title') },
        h('h2', {}, t('win.title')),
        h('p', {}, levelName(s.def)),
        h('div.stars', { 'aria-label': t('win.starsLabel', { n: starCount(best) }) }, starText(best)),
        h(
          'div.goals',
          {},
          goal(true, t('win.goal.clear')),
          par ? goal(now.ghosts, t('win.goal.ghosts', { g: ghosts, par: par.ghosts })) : null,
          par ? goal(now.steps, t('win.goal.steps', { b: beats, par: par.steps })) : null,
        ),
        h(
          'div.row',
          {},
          hasOwn ? h('button.btn', { onclick: () => this.playReplay() }, t('win.replay')) : null,
          h('button.btn', { onclick: () => { this.closeModal(); this.command('undo', true); } }, t('win.undo')),
          h('button.btn', { onclick: () => this.exit() }, this.back),
          next ? h('button.btn.primary', { onclick: () => this.open(next, this.back) }, t('win.next')) : null,
        ),
      ),
      true,
    );
  }

  /**
   * 过关回放：从头重放最终时间线。虚线是每个影子留影时原本走的路，实线是它实际走出来的路，
   * 红圈标出第一次走岔的地方。
   */
  private playReplay(): void {
    const s = this.session!;
    this.closeModal();
    this.stopDemo();
    const frames = replayTimeline(s.board, s.initial, s.state.world);
    const finalWorld = s.state.world;
    const own = finalWorld.ghosts.filter((g) => !g.preset);
    const actual = new Map<number, number[]>(own.map((g) => [g.id, []]));
    let i = 0;
    this.replaying = true;
    // 回放中按任意键或点一下就结束（不只是游戏里绑定的那几个键）
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', stop, true);
      window.removeEventListener('pointerdown', stop, true);
      this.endReplay();
    };
    window.setTimeout(() => {
      window.addEventListener('keydown', stop, true);
      window.addEventListener('pointerdown', stop, true);
    }, 0);
    this.stopReplayListeners = () => {
      window.removeEventListener('keydown', stop, true);
      window.removeEventListener('pointerdown', stop, true);
    };
    this.setHint(t('replay.hint'), true);
    const show = () => {
      const f = frames[i];
      for (const g of f.world.ghosts) {
        const a = actual.get(g.id);
        if (a && !g.gone && a.length <= g.ip) a.push(g.pos);
      }
      this.view.sync({ world: f.world, rec: null }, f.events, i === 0);
      this.view.setOverlay({
        kind: 'compare',
        ghosts: own.map((g) => ({ color: ghostColor(g, finalWorld.ghosts), planned: g.recPath, actual: actual.get(g.id)! })),
      });
      renderTimeline(this.timeline, { world: f.world, rec: null }, s.def.maxRecord, s.board);
      this.renderHud({ world: f.world, rec: null });
      if (++i < frames.length) this.demoTimer = window.setTimeout(show, i === 1 ? 600 : 380);
      else this.demoTimer = 0;
    };
    show();
  }

  private replaying = false;
  private previewBtn: HTMLElement | null = null;
  private previewOn = false;
  private previewHeld = false;

  /** 预演：假设你原地不动，影子们接下来几步会去哪、哪一步会被挡住 */
  private updatePreview(): void {
    if (this.replaying) return;
    const s = this.session;
    this.previewBtn?.classList.toggle('on', this.previewOn);
    if (!s || !(this.previewOn || this.previewHeld)) return this.view.setOverlay(null);
    let w = s.state.world;
    const all = w.ghosts;
    const out = new Map<number, { color: number; cells: number[]; blockedAt: number[] }>();
    for (const g of all) if (g.ip < g.program.length) out.set(g.id, { color: ghostColor(g, all), cells: [], blockedAt: [] });
    for (let k = 0; k < PREVIEW_STEPS && w.ghosts.some((g) => g.ip < g.program.length); k++) {
      const before = w;
      w = step(s.board, w, WAIT).world;
      w.ghosts.forEach((g, gi) => {
        const o = out.get(g.id);
        if (!o || before.ghosts[gi].ip >= before.ghosts[gi].program.length) return;
        if (g.gone) return void o.blockedAt.push(before.ghosts[gi].pos);
        o.cells.push(g.pos);
        if (g.log[g.log.length - 1] === 'blocked') o.blockedAt.push(g.pos);
      });
    }
    this.view.setOverlay({ kind: 'preview', ghosts: [...out.values()] });
  }

  /** 结束回放，回到通关画面 */
  private stopReplayListeners: (() => void) | null = null;

  private endReplay(): void {
    if (!this.replaying) return;
    this.stopReplayListeners?.();
    this.stopReplayListeners = null;
    this.stopDemo();
    this.replaying = false;
    this.view.setOverlay(null);
    const s = this.session!;
    this.view.sync(s.state, [], true);
    this.refresh();
    this.setHint(levelHint(s.def) ?? '');
    this.showWin();
  }

  private openModal(content: HTMLElement, sticky = false): void {
    clear(this.modal);
    this.modal.append(content);
    if (sticky) this.modal.dataset.sticky = '1';
    else delete this.modal.dataset.sticky;
    this.modal.classList.add('show');
    this.modalOpenedAt = performance.now();
    // 默认选中主按钮（过关时是“下一关”），没有就选第一个
    const first = this.modal.querySelector<HTMLElement>('.btn.primary') ?? this.modalButtons()[0];
    first?.focus();
  }

  private closeModal(): void {
    this.modal.classList.remove('show');
    delete this.modal.dataset.sticky;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private modalOpenedAt = 0;

  private modalButtons(): HTMLElement[] {
    return [...this.modal.querySelectorAll<HTMLElement>('.modal .btn')].filter((b) => b.offsetParent !== null && !b.hasAttribute('disabled'));
  }

  /** 弹窗里的键盘操作：方向键切换按钮，回车 / 空格按下，Esc 关掉（过关弹窗除外） */
  private onModalKey = (e: KeyboardEvent): void => {
    if (!this.modal.classList.contains('show')) return;
    const btns = this.modalButtons();
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLElement);
    const move = (d: number) => {
      e.preventDefault();
      const from = i < 0 ? (d > 0 ? -1 : 0) : i; // 还没选中时：右 / 下选第一个，左 / 上选最后一个
      btns[(from + d + btns.length) % btns.length].focus();
    };
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        return move(1);
      case 'ArrowLeft':
      case 'ArrowUp':
        return move(-1);
      case 'Enter':
      case ' ':
        e.preventDefault();
        // 刚弹出来的一小会儿不认确认键，免得过关时手上没停的按键直接跳了关
        if (performance.now() - this.modalOpenedAt < 350) return;
        if (!e.repeat) (btns[i] ?? btns.find((b) => b.classList.contains('primary')) ?? btns[0]).click();
        return;
      case 'Escape':
        if (!this.modal.dataset.sticky) {
          e.preventDefault();
          this.closeModal();
        }
        return;
    }
  };

  /** 操作说明：第一次进游戏时自动弹出，之后点右上角 ? 打开 */
  private showControls(): void {
    this.hooks.markControlsSeen();
    const row = (keys: string[], text: string, touch?: string) =>
      h('div.ctl-row', {}, h('div.ctl-keys', {}, ...keys.map((k) => h('kbd', {}, k))), h('div.ctl-text', {}, text, touch ? h('div.ctl-touch', {}, touch) : null));
    this.openModal(
      h(
        'div.modal.controls-modal',
        { role: 'dialog', 'aria-label': t('controls.title') },
        h('h2', {}, t('controls.title')),
        h(
          'div.ctl-list',
          {},
          row(['↑ ↓ ← →', 'WASD'], t('controls.move'), t('controls.swipe')),
          row(['E', 'Enter'], t('controls.imprint'), t('controls.imprintTouch')),
          row(['Esc'], t('controls.cancel')),
          row(['Space'], t('controls.wait')),
          row(['Z'], t('controls.undo')),
          row(['R'], t('controls.restart')),
          this.hooks.hintsUnlocked() ? row(['H'], t('controls.hint')) : null,
          row(['T', 'M'], t('controls.misc')),
        ),
        h('div.row', {}, h('button.btn.primary', { onclick: () => this.closeModal() }, t('controls.ok'))),
      ),
    );
  }

  /** 每次回溯在参考解里的位置（动作下标，含该回溯） */
  private sealPoints(): number[] {
    const sol = this.session?.def.solution;
    if (!sol) return [];
    const out: number[] = [];
    parseActions(sol).forEach((a, i) => a === 'seal' && out.push(i + 1));
    return out;
  }

  /**
   * 分步提示：先一条条翻文字提示；翻完后可以演示到第 1 次回溯、第 2 次回溯……
   * 每段演示完把控制权交还玩家；最后才是完整答案。
   */
  private showHints(): void {
    const s = this.session!;
    const hints = levelHints(s.def);
    const seals = this.sealPoints();
    const sol = s.def.solution;
    const list = h('ol.hint-list');
    const intro = levelHint(s.def);
    hints.slice(0, this.hintShown).forEach((x) => list.append(h('li', {}, x)));

    let next: HTMLElement | null = null;
    if (this.hintShown < hints.length) {
      next = h('button.btn.primary', { onclick: () => { this.hintShown++; sfx.play('ui'); this.showHints(); } },
        t(this.hintShown ? 'hints.more' : 'hints.first', { n: this.hintShown + 1, total: hints.length }));
    } else if (sol && this.demoShown < seals.length) {
      const k = this.demoShown;
      next = h('button.btn.primary', { onclick: () => { this.demoShown++; this.playDemo(sol, seals[k]); } },
        t('hints.demoPart', { n: k + 1 }));
    } else if (sol) {
      next = h('button.btn.primary', { onclick: () => this.playDemo(sol) }, t('hints.full'));
    }
    const status = hints.length
      ? t('hints.progress', { n: this.hintShown, total: hints.length })
      : t('play.noHint');
    this.openModal(
      h(
        'div.modal.hints-modal',
        { role: 'dialog', 'aria-label': t('help.title') },
        h('h2', {}, t('help.title')),
        h('p.hint-status', {}, status),
        intro ? h('p.hint-intro', {}, intro) : null,
        this.hintShown ? list : null,
        this.hintShown >= hints.length && sol ? h('p', {}, t(this.demoShown < seals.length ? 'hints.demoNote' : 'hints.fullNote')) : null,
        h('div.row', {}, h('button.btn', { onclick: () => this.closeModal() }, t('help.think')), next),
      ),
    );
  }

  /** 从头演示参考解；upto 给定时只演示到那里，然后交还玩家 */
  private playDemo(sol: string, upto?: number): void {
    const s = this.session!;
    this.closeModal();
    s.hardReset();
    this.view.sync(s.state, [], true);
    this.refresh();
    const list = parseActions(sol).slice(0, upto);
    let i = 0;
    this.setHint(t('play.demo'), true);
    const tick = () => {
      if (i >= list.length) {
        this.stopDemo();
        if (upto !== undefined) this.setHint(t('hints.yourTurn'), true);
        return;
      }
      const a = list[i++];
      this.command(a === 'rec' || a === 'seal' ? 'recToggle' : a, true);
      this.demoTimer = window.setTimeout(tick, a === 'seal' ? 700 : 260);
    };
    this.demoTimer = window.setTimeout(tick, 400);
  }

  private stopDemo(): void {
    if (this.demoTimer) clearTimeout(this.demoTimer);
    this.demoTimer = 0;
  }
}
