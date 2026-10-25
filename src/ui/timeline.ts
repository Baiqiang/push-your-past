import { GameState, INSTR_ARROWS } from '../core/types';
import { t } from '../i18n';
import { ghostColor, ghostNumber, hex, THEME } from '../render/theme';
import { clear, h } from './dom';

/** 侧栏：每个影子要走的每一步、现在走到哪了、哪一步被挡住了 */
export function renderTimeline(el: HTMLElement, s: GameState, maxRecord: number): void {
  clear(el);
  const w = s.world;
  if (!w.ghosts.length && !s.rec) {
    el.append(h('div.tl-empty', {}, t('play.side.empty1'), h('br'), t('play.side.empty2'), h('br'), t('play.side.empty3')));
    return;
  }
  for (const g of w.ghosts) {
    const c = hex(ghostColor(g, w.ghosts));
    const label = t(g.preset ? 'play.echo' : 'play.shadow', { n: ghostNumber(g, w.ghosts) });
    const status = g.gone ? t('play.erased') : g.waiting ? t('play.waiting') : g.ip >= g.program.length ? t('play.idle') : `${g.ip}/${g.program.length}`;
    const chips = g.program.map((ins, k) => {
      const res = g.log[k];
      const cls = ['chip'];
      if (k < g.ip) cls.push(res === 'blocked' ? 'blocked' : 'done');
      if (k === g.ip) cls.push('cur');
      return h('span.' + cls.join('.'), { style: `--c:${c}`, title: res === 'blocked' ? t('play.chip.blocked') : undefined }, INSTR_ARROWS[ins]);
    });
    el.append(
      h(
        'div.tl-row' + (g.preset ? '.echo' : ''),
        {},
        h('div.tl-head', { style: `color:${c}` }, h('span.dot'), h('span.label', {}, label), h('span', {}, status)),
        h('div.chips', {}, ...chips),
      ),
    );
  }
  if (s.rec) {
    const c = hex(THEME.recording);
    const chips = s.rec.inputs.map((ins) => h('span.chip', { style: `--c:${c}` }, INSTR_ARROWS[ins]));
    for (let k = s.rec.inputs.length; k < maxRecord; k++) chips.push(h('span.chip.empty', {}, '·'));
    el.append(
      h(
        'div.tl-row',
        {},
        h('div.tl-head', { style: `color:${c}` }, h('span.dot'), h('span.label', {}, t('play.recordingRow')), h('span', {}, `${s.rec.inputs.length}/${maxRecord}`)),
        h('div.chips', {}, ...chips),
      ),
    );
  }
}
