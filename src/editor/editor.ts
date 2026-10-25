import { initialState } from '../core/game';
import { parseLevel, PRESET_HOLD } from '../core/level';
import { LevelDef } from '../core/types';
import { sfx } from '../audio/sfx';
import { BoardView } from '../render/board';
import { clear, h, toast } from '../ui/dom';
import { errorText, t } from '../i18n';
import type { SolveMessage, SolveRequest } from './solver.worker';

interface Tool {
  ch: string;
  label: string;
  name: () => string;
}

/** '1' 表示“放一个新残影”，实际写入的数字由编辑器分配 */
const ECHO = '1';
/** 传送门工具：第一下放 (，第二下放 )，最多一对 */
const PORTAL = 'O';
const TOOLS: Tool[] = [
  { ch: '#', label: '▉', name: () => t('editor.tool.wall') },
  { ch: '.', label: '·', name: () => t('editor.tool.floor') },
  { ch: ' ', label: '⌫', name: () => t('editor.tool.erase') },
  { ch: '@', label: '☺', name: () => t('editor.tool.player') },
  { ch: '$', label: '▣', name: () => t('editor.tool.box') },
  { ch: '_', label: '◇', name: () => t('editor.tool.goal') },
  { ch: 'E', label: '⬚', name: () => t('editor.tool.exit') },
  { ch: ECHO, label: '⌜⌟', name: () => t('editor.tool.echo') },
  ...['a', 'b', 'c'].flatMap((c) => [
    { ch: c, label: c, name: () => t('editor.tool.plate', { c }) },
    { ch: c.toUpperCase(), label: c.toUpperCase(), name: () => t('editor.tool.door', { c: c.toUpperCase() }) },
  ]),
  { ch: 'S', label: 'S', name: () => t('editor.tool.gatePast') },
  { ch: 'Y', label: 'Y', name: () => t('editor.tool.gateNow') },
  { ch: '%', label: '%', name: () => t('editor.tool.crack') },
  { ch: PORTAL, label: '◎', name: () => t('editor.tool.portal') },
  { ch: 'H', label: '⏸', name: () => t('editor.tool.hold') },
  { ch: 'r', label: '▶', name: () => t('editor.tool.release') },
  { ch: '^', label: '↑', name: () => t('editor.tool.oneway') },
  { ch: '>', label: '→', name: () => t('editor.tool.oneway') },
  { ch: 'v', label: '↓', name: () => t('editor.tool.oneway') },
  { ch: '<', label: '←', name: () => t('editor.tool.oneway') },
];
const isDigit = (c: string) => c >= '1' && c <= '9';

export interface EditorHooks {
  onExit(): void;
  onTest(def: LevelDef): void;
  onSave(def: LevelDef): void;
}

export class EditorScreen {
  readonly el: HTMLElement;
  private boardHost: HTMLElement;
  private grid: string[][] = [];
  private tool = '#';
  private painting = false;
  private out: HTMLElement;
  private worker: Worker | null = null;
  private modal: HTMLElement;
  private f: Record<'name' | 'w' | 'h' | 'ghosts' | 'rec' | 'hint', HTMLInputElement>;
  private id = 'custom-' + Date.now().toString(36);
  private solution: string | undefined;
  private presets: string[] = [];
  private par: LevelDef['par'];
  private strokeStart = false;
  private presetBox: HTMLElement;

  constructor(private view: BoardView, private hooks: EditorHooks) {
    const input = (val: string, type = 'text', cls = '') => h('input' + cls, { value: val, type }) as HTMLInputElement;
    this.f = {
      name: input(t('editor.defaultName'), 'text', '.wide'),
      w: input('9', 'number'),
      h: input('7', 'number'),
      ghosts: input('2', 'number'),
      rec: input('8', 'number'),
      hint: input('', 'text', '.wide'),
    };
    this.f.w.addEventListener('change', () => this.resize());
    this.f.h.addEventListener('change', () => this.resize());
    this.boardHost = h('div.board-wrap');
    this.out = h('div.solver-out', {}, t('editor.solver.intro'));
    this.modal = h('div.modal-back');

    const toolBtns = TOOLS.map((tl) =>
      h('button.btn.tool' + (tl.ch === this.tool ? '.sel' : ''), { title: tl.name(), 'aria-label': tl.name(), 'data-ch': tl.ch, onclick: () => this.pick(tl.ch) }, tl.label, h('small', {}, tl.name())),
    );
    this.presetBox = h('div.stack');
    const field = (label: string, el: HTMLElement) => h('div.field', {}, h('label', {}, label), el);

    this.el = h(
      'section.screen',
      {},
      h(
        'div.topbar',
        {},
        h('button.btn.icon-btn', { onclick: () => this.exit(), 'aria-label': t('play.back') }, '←'),
        h('h2', {}, t('editor.title')),
        h('button.btn', { onclick: () => this.test() }, t('editor.test')),
        h('button.btn.wide-only', { onclick: () => this.save() }, t('editor.save')),
      ),
      h(
        'div.editor-main',
        {},
        h(
          'div.palette',
          {},
          h('div', {}, h('h5', {}, t('editor.tools')), h('div.tools', {}, ...toolBtns)),
          h(
            'div',
            {},
            h('h5', {}, t('editor.level')),
            field(t('editor.field.name'), this.f.name),
            field(t('editor.field.w'), this.f.w),
            field(t('editor.field.h'), this.f.h),
            field(t('editor.field.ghosts'), this.f.ghosts),
            field(t('editor.field.rec'), this.f.rec),
            field(t('editor.field.hint'), this.f.hint),
          ),
          h('div', {}, h('h5', {}, t('editor.echoes')), h('p.solver-out', {}, t('editor.echoes.sub')), this.presetBox),
          h(
            'div.stack',
            {},
            h('h5', {}, t('editor.check')),
            h('button.btn', { onclick: () => this.runSolver() }, t('editor.run')),
            this.out,
          ),
          h(
            'div.stack',
            {},
            h('h5', {}, t('editor.data')),
            h('button.btn', { onclick: () => this.save() }, t('editor.saveCustom')),
            h('button.btn', { onclick: () => this.exportDialog() }, t('editor.json')),
            h('button.btn', { onclick: () => this.blank() }, t('editor.clear')),
          ),
        ),
        this.boardHost,
      ),
      this.modal,
    );

    this.boardHost.addEventListener('pointerdown', (e) => {
      this.painting = true;
      this.strokeStart = true;
      this.boardHost.setPointerCapture(e.pointerId);
      this.paintAt(e);
    });
    this.boardHost.addEventListener('pointermove', (e) => this.painting && this.paintAt(e));
    this.boardHost.addEventListener('pointerup', () => (this.painting = false));
    this.boardHost.addEventListener('pointercancel', () => (this.painting = false));
    this.blank();
  }

  /** 打开编辑器；传入关卡则载入（用于改编内置关卡或继续编辑自定义关卡） */
  open(def?: LevelDef): void {
    this.view.attach(this.boardHost);
    if (def) this.load(def);
    else this.redraw();
  }

  private load(def: LevelDef): void {
    const w = Math.max(...def.map.map((r) => r.length));
    this.grid = def.map.map((r) => r.padEnd(w, ' ').split(''));
    this.f.name.value = def.name;
    this.f.w.value = String(w);
    this.f.h.value = String(def.map.length);
    this.f.ghosts.value = String(def.maxGhosts);
    this.f.rec.value = String(def.maxRecord);
    this.f.hint.value = def.hint ?? '';
    this.id = def.id.startsWith('custom-') ? def.id : 'custom-' + Date.now().toString(36);
    this.solution = def.solution;
    this.par = def.par;
    this.presets = [...(def.presets ?? [])];
    this.redraw();
  }

  private exit(): void {
    this.worker?.terminate();
    this.worker = null;
    this.hooks.onExit();
  }

  private pick(ch: string): void {
    this.tool = ch;
    sfx.play('ui');
    for (const b of this.el.querySelectorAll<HTMLElement>('.tool')) b.classList.toggle('sel', b.dataset.ch === ch);
  }

  private blank(): void {
    const w = 9;
    const hh = 7;
    this.grid = Array.from({ length: hh }, (_, y) =>
      Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === hh - 1 ? '#' : '.')),
    );
    this.grid[3][1] = '@';
    this.grid[3][7] = 'E';
    this.f.w.value = String(w);
    this.f.h.value = String(hh);
    this.solution = undefined;
    this.presets = [];
    this.redraw();
  }

  private resize(): void {
    const w = clamp(+this.f.w.value || 9, 3, 20);
    const hh = clamp(+this.f.h.value || 7, 3, 16);
    this.f.w.value = String(w);
    this.f.h.value = String(hh);
    this.grid = Array.from({ length: hh }, (_, y) => Array.from({ length: w }, (_, x) => this.grid[y]?.[x] ?? '#'));
    // 被裁掉的残影一并删除
    for (let k = this.presets.length; k >= 1; k--) if (!this.grid.some((r) => r.includes(String(k)))) this.removeEcho(k);
    this.redraw();
  }

  private paintAt(e: PointerEvent): void {
    const r = this.boardHost.getBoundingClientRect();
    const cell = this.view.cellAt(e.clientX - r.left, e.clientY - r.top);
    if (cell < 0) return;
    const w = this.grid[0].length;
    const x = cell % w;
    const y = (cell / w) | 0;
    const cur = this.grid[y][x];
    const onGoal = cur === '_' || cur === '*' || cur === '+';
    let ch = this.tool;
    if (ch === ECHO) {
      if (isDigit(cur) || this.presets.length >= 9 || !this.strokeStart) return;
      this.presets.push('W');
      ch = String(this.presets.length);
    } else if (ch === PORTAL) {
      if (cur === '(' || cur === ')' || !this.strokeStart) return;
      const has = (c: string) => this.grid.some((r) => r.includes(c));
      if (has('(') && has(')')) return void toast(this.boardHost, t('editor.portalFull'));
      ch = has('(') ? ')' : '(';
    } else if (isDigit(cur)) {
      this.removeEcho(+cur);
    }
    this.strokeStart = false;
    if (ch === '@') {
      // 只能有一个玩家
      for (const row of this.grid) for (let i = 0; i < row.length; i++) {
        if (row[i] === '@') row[i] = '.';
        if (row[i] === '+') row[i] = '_';
      }
      if (onGoal) ch = '+';
    } else if (ch === '$' && onGoal) ch = '*';
    else if (ch === '_' && (cur === '$' || cur === '*')) ch = '*';
    else if (ch === '_' && (cur === '@' || cur === '+')) ch = '+';
    if (cur === ch) return;
    this.grid[y][x] = ch;
    this.solution = undefined;
    this.redraw();
  }

  private toDef(): LevelDef {
    return {
      id: this.id,
      name: this.f.name.value.trim() || t('editor.unnamed'),
      chapter: 0,
      hint: this.f.hint.value.trim() || undefined,
      maxGhosts: clamp(+this.f.ghosts.value || 0, 0, 6),
      maxRecord: clamp(+this.f.rec.value || 1, 1, 32),
      map: this.grid.map((r) => r.join('').replace(/\s+$/, '')),
      presets: this.presets.length ? [...this.presets] : undefined,
      solution: this.solution,
      par: this.solution ? this.par : undefined,
    };
  }

  /** 删掉第 k 个残影，后面的编号往前挪 */
  private removeEcho(k: number): void {
    this.presets.splice(k - 1, 1);
    for (const row of this.grid) for (let i = 0; i < row.length; i++) {
      if (row[i] === String(k)) row[i] = '.';
      else if (isDigit(row[i]) && +row[i] > k) row[i] = String(+row[i] - 1);
    }
    this.solution = undefined;
  }

  private renderPresets(): void {
    clear(this.presetBox);
    if (!this.presets.length) return void this.presetBox.append(h('div.solver-out', {}, t('editor.echoes.none')));
    this.presets.forEach((prog, i) => {
      const held = prog.startsWith(PRESET_HOLD);
      const inp = h('input.wide', { value: held ? prog.slice(PRESET_HOLD.length) : prog, 'aria-label': t('play.echo', { n: i + 1 }), spellcheck: 'false' }) as HTMLInputElement;
      // 开局待命：切换动作串前面的 ⏸
      const hold = h('button.btn.icon-btn.toggle' + (held ? '.on' : ''), { title: t('editor.echo.hold'), 'aria-label': t('editor.echo.hold'), 'aria-pressed': held ? 'true' : 'false' }, '⏸');
      const sync = () => {
        this.presets[i] = (hold.classList.contains('on') ? PRESET_HOLD : '') + inp.value;
        this.solution = undefined;
      };
      inp.addEventListener('input', () => {
        inp.value = inp.value.toUpperCase().replace(/[^URDLW]/g, '');
        sync();
      });
      hold.addEventListener('click', () => {
        hold.classList.toggle('on');
        hold.setAttribute('aria-pressed', hold.classList.contains('on') ? 'true' : 'false');
        sync();
        this.redraw(false);
      });
      // 改动作只刷新地图，不重建列表（否则会把正要点的按钮换掉）
      inp.addEventListener('change', () => this.redraw(false));
      const del = h('button.btn.icon-btn', { title: t('editor.echo.remove', { n: i + 1 }), 'aria-label': t('editor.echo.remove', { n: i + 1 }) }, '×');
      del.addEventListener('click', () => {
        this.removeEcho(i + 1);
        this.redraw();
      });
      this.presetBox.append(h('div.field', {}, h('label', {}, t('play.echo', { n: i + 1 })), inp, hold, del));
    });
  }

  /** list=false 时只刷新地图，不重建残影列表 */
  private redraw(list = true): void {
    if (list && this.presetBox.querySelector('input') !== document.activeElement) this.renderPresets();
    try {
      // 残影动作还空着时先用“等”占位，好让地图照常显示
      const presets = this.presets.map((p) => p || 'W');
      const { board, world } = parseLevel({ map: this.grid.map((r) => r.join('')), presets });
      this.view.setLevel(board);
      this.view.sync(initialState(world), [], true);
    } catch (err) {
      toast(this.boardHost, errorText(err));
    }
  }

  private valid(): boolean {
    try {
      const { board } = parseLevel(this.toDef());
      if (!board.goalCount && !board.hasExit) {
        toast(this.boardHost, t('err.needGoal'));
        return false;
      }
      return true;
    } catch (err) {
      toast(this.boardHost, errorText(err));
      return false;
    }
  }

  private test(): void {
    if (this.valid()) this.hooks.onTest(this.toDef());
  }

  private save(): void {
    if (!this.valid()) return;
    this.hooks.onSave(this.toDef());
    toast(this.boardHost, t('editor.saved'));
  }

  private runSolver(): void {
    if (!this.valid()) return;
    this.worker?.terminate();
    const def = this.toDef();
    clear(this.out);
    this.out.append(t('editor.solver.running', { n: 0 }));
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    const req: SolveRequest = { map: def.map, presets: def.presets, maxGhosts: def.maxGhosts, maxRecord: def.maxRecord, maxNodes: 3_000_000 };
    worker.onmessage = (e: MessageEvent<SolveMessage>) => {
      const m = e.data;
      if (m.type === 'progress') {
        clear(this.out);
        this.out.append(t('editor.solver.running', { n: m.nodes.toLocaleString() }));
        return;
      }
      worker.terminate();
      this.worker = null;
      clear(this.out);
      if (m.error) return void this.out.append(h('span.bad', {}, errorText(m.error)));
      const steps = (sol: string) => sol.replace(/\[[^\]]*\]/g, '').length;
      const limit = h('span', {}, t('editor.solver.limit'));
      const ng = m.noGhost;
      this.out.append(
        h('div', {}, t('editor.solver.noGhost'),
          ng.status === 'unsolvable' ? h('span.ok', {}, t('editor.solver.noGhost.ok'))
          : ng.status === 'solved' ? h('span.bad', {}, t('editor.solver.noGhost.bad', { n: steps(ng.solution) }))
          : limit),
      );
      const f = m.full;
      if (f) {
        if (f.status === 'solved') {
          this.solution = f.solution;
          this.par = m.par ?? undefined;
          this.out.append(h('div', {}, t('editor.solver.full'), h('span.ok', {}, t('editor.solver.full.ok', { n: steps(f.solution) }))), h('div', {}, f.solution));
        } else if (f.status === 'unsolvable') this.out.append(h('div', {}, t('editor.solver.full'), h('span.bad', {}, t('editor.solver.full.bad'))));
        else this.out.append(h('div', {}, t('editor.solver.full'), limit.cloneNode(true)), h('div', {}, t('editor.solver.limitHint', { n: f.nodes.toLocaleString() })));
      }
      const fw = m.fewer;
      if (fw) {
        this.out.append(
          h('div', {}, t('editor.solver.fewer'),
            fw.status === 'unsolvable' ? h('span.ok', {}, t('editor.solver.fewer.ok'))
            : fw.status === 'solved' ? h('span.bad', {}, t('editor.solver.fewer.bad'))
            : limit.cloneNode(true)),
        );
      }
    };
    worker.postMessage(req);
  }

  private exportDialog(): void {
    clear(this.modal);
    const ta = h('textarea', { 'aria-label': 'JSON', spellcheck: 'false' }) as HTMLTextAreaElement;
    ta.value = JSON.stringify(this.toDef(), null, 2);
    const close = () => this.modal.classList.remove('show');
    this.modal.append(
      h(
        'div.modal',
        { role: 'dialog' },
        h('h2', {}, 'JSON'),
        h('p', {}, t('editor.json.sub')),
        ta,
        h(
          'div.row',
          {},
          h('button.btn', { onclick: close }, t('editor.json.close')),
          h('button.btn', { onclick: () => void navigator.clipboard?.writeText(ta.value).then(() => toast(this.boardHost, t('editor.json.copied'))) }, t('editor.json.copy')),
          h('button.btn.primary', {
            onclick: () => {
              try {
                const d = JSON.parse(ta.value) as LevelDef;
                if (!d || !Array.isArray(d.map) || !d.map.every((r) => typeof r === 'string')) throw new Error(t('err.badJson'));
                if (d.presets && !(Array.isArray(d.presets) && d.presets.every((p) => typeof p === 'string'))) throw new Error(t('err.badJson'));
                parseLevel(d);
                this.load({ ...d, id: String(d.id ?? 'custom'), name: String(d.name ?? t('editor.imported')), chapter: 0, maxGhosts: +d.maxGhosts || 2, maxRecord: +d.maxRecord || 8 });
                close();
              } catch (err) {
                toast(this.boardHost, t('editor.json.failed', { e: err instanceof SyntaxError ? t('err.badJson') : errorText(err) }));
              }
            },
          }, t('editor.json.import')),
        ),
      ),
    );
    this.modal.classList.add('show');
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
