import './ui/styles.css';
import { sfx } from './audio/sfx';
import { LevelDef } from './core/types';
import { EditorScreen } from './editor/editor';
import { detectLang, Lang, setLang, t } from './i18n';
import { LEVELS } from './levels';
import { BoardView } from './render/board';
import { clear, h } from './ui/dom';
import { PlayScreen } from './ui/play';
import { SelectScreen } from './ui/select';
import { load, save } from './storage';
import { bindCheat } from './input/cheat';
import { startCommando } from './ui/commando';
import { toast } from './ui/dom';

async function main() {
  const app = document.getElementById('app')!;
  const data = load();
  sfx.muted = data.muted;
  setLang(data.lang ?? detectLang());

  // 一个 Pixi 应用在游戏与编辑器之间共用
  const parking = h('div', { style: 'position:absolute;width:10px;height:10px;left:-99px;top:0' });
  document.body.append(parking);
  const view = new BoardView(parking);
  await view.init();
  view.showTrails = data.trails;

  // 秘籍：上上下下左右左右 BA，解锁提示（存档记住）
  const applyCheats = () => document.body.classList.toggle('hints-on', !!data.cheats);
  applyCheats();
  bindCheat(
    () => {
      if (data.cheats) return;
      data.cheats = true;
      save(data);
      applyCheats();
      sfx.play('win');
      for (const el of app.querySelectorAll('.cheat-line')) el.textContent = t('title.cheatOn');
      toast(document.querySelector<HTMLElement>('.screen.active') ?? app, t('cheat.on'));
    },
    // 手机滑动只在标题页认，免得和游戏里的滑动移动混在一起
    (target) => target instanceof Element && !!target.closest('.title-screen'),
  );

  // 彩蛋小兵：只在标题页 / 选关页出现，把秘籍演一遍
  startCommando(
    () => !!document.querySelector('.screen.active.title-screen, .screen.active.select-screen') && !document.querySelector('.modal-back.show'),
    () => !!data.cheats,
  );

  let teardown = () => {};
  /** 构建全部界面；切换语言时整体重建（只会在标题页切换，不会打断正在玩的关） */
  function build() {
    teardown();
    let returnTo: 'select' | 'editor' = 'select';
    let editingDef: LevelDef | undefined;

    const show = (el: HTMLElement) => {
      for (const s of app.querySelectorAll('.screen')) s.classList.toggle('active', s === el);
    };
    const playLevel = (def: LevelDef, from: 'select' | 'editor') => {
      returnTo = from;
      show(play.el);
      play.open(def, t(from === 'editor' ? 'play.backToEditor' : 'play.backToSelect'));
    };
    const openSelect = () => {
      play.close();
      select.render(data);
      show(select.el);
    };
    const openEditor = (def?: LevelDef) => {
      play.close();
      editingDef = def;
      show(editor.el);
      editor.open(def);
    };

    const play = new PlayScreen(view, {
      onExit: () => (returnTo === 'editor' ? openEditor(editingDef) : openSelect()),
      onWin: (def, beats, ghosts) => {
        const prev = data.solved[def.id];
        data.solved[def.id] = prev ? { beats: Math.min(prev.beats, beats), ghosts: Math.min(prev.ghosts, ghosts) } : { beats, ghosts };
        save(data);
      },
      best: (def) => data.solved[def.id],
      nextLevel: (def) => {
        if (def.chapter === 0) return null;
        const next = LEVELS[LEVELS.findIndex((l) => l.id === def.id) + 1];
        return next ?? null;
      },
      muted: () => data.muted,
      setMuted: (m) => {
        data.muted = sfx.muted = m;
        save(data);
      },
      trails: () => data.trails,
      setTrails: (v) => {
        data.trails = v;
        save(data);
      },
      controlsSeen: () => !!data.controlsSeen,
      hintsUnlocked: () => !!data.cheats,
      markControlsSeen: () => {
        data.controlsSeen = true;
        save(data);
      },
    });

    const select = new SelectScreen({
      onBack: () => show(title),
      onPlay: (def) => playLevel(def, 'select'),
      onEdit: (def) => openEditor(def),
      onDeleteCustom: (id) => {
        if (!confirm(t('select.confirmDelete'))) return;
        data.custom = data.custom.filter((l) => l.id !== id);
        save(data);
        select.render(data);
      },
    });

    const editor = new EditorScreen(view, {
      onExit: () => openSelect(),
      onTest: (def) => {
        editingDef = def;
        playLevel(def, 'editor');
      },
      onSave: (def) => {
        editingDef = def;
        const i = data.custom.findIndex((l) => l.id === def.id);
        if (i >= 0) data.custom[i] = def;
        else data.custom.push(def);
        save(data);
      },
    });

    const firstUnsolved = () => LEVELS.find((l) => !data.solved[l.id]) ?? LEVELS[0];
    const switchLang = () => {
      const next: Lang = t('title.lang') === 'English' ? 'en' : 'zh';
      data.lang = next;
      save(data);
      setLang(next);
      sfx.play('ui');
      build();
    };
    const title = h(
      'section.screen.bg-grid.title-screen',
      {},
      h('button.btn.lang-btn', { onclick: switchLang, 'aria-label': t('title.lang') }, t('title.lang')),
      h(
        'div.title-wrap',
        {},
        h('div.logo', {}, 'PUSH ', h('span.past', {}, 'YOUR PAST')),
        h('div.tagline', {}, t('title.tagline')),
        h(
          'div.menu',
          {},
          h('button.btn.primary', { onclick: () => (sfx.play('ui'), playLevel(firstUnsolved(), 'select')) },
            t(Object.keys(data.solved).length ? 'title.continue' : 'title.start')),
          h('button.btn', { onclick: () => (sfx.play('ui'), openSelect()) }, t('title.levels')),
          h('button.btn', { onclick: () => (sfx.play('ui'), openEditor()) }, t('title.editor')),
        ),
        h('div.cheat-line', { 'aria-live': 'polite' }, t(data.cheats ? 'title.cheatOn' : 'title.cheatTease')),
      ),
    );

    teardown = () => play.close();
    // 画布此时可能挂在旧界面里，先挪回停车位再清空
    view.attach(parking);
    clear(app);
    app.append(title, select.el, play.el, editor.el);
    show(title);
  }

  build();
}

void main();

// PWA：只在正式构建里注册 Service Worker（开发时会干扰热更新）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 不支持或被禁用时照常玩，只是不能离线 */
    });
  });
}
