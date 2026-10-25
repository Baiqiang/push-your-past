import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/**
 * 生成 Service Worker：构建时把所有产物列进预缓存清单，内容一变 sw.js 就跟着变，浏览器才会更新。
 *   - 页面（HTML）：先走网络，失败用缓存，保证能拿到新版本
 *   - 其他静态文件（带哈希）：先用缓存
 *   - Google 字体：用过一次就缓存，离线时也有字体
 */
function serviceWorker(): Plugin {
  return {
    name: 'pyp-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // public/ 下的静态文件不在 bundle 里，单独列出来
      const statics = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      const files = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.map')).map((f) => './' + f), ...statics.map((f) => './' + f)];
      const version = createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, files) });
    },
  };
}

function swSource(version: string, files: string[]): string {
  return `// 构建时生成，不要手改（见 vite.config.ts）
const CACHE = 'pyp-${version}';
const FONT_CACHE = 'pyp-fonts';
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then((c) =>
        c.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => (c.put(req, res.clone()), res))),
      ),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => (caches.open(CACHE).then((c) => c.put('./', res.clone())), res))
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  // 服务器可能带 Vary: Origin，而模块脚本请求带 Origin、预缓存请求不带，所以匹配时忽略 Vary
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
}

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  plugins: [serviceWorker()],
});
