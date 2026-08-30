// この行は .githooks/pre-commit によってコミット時に自動更新される
// (日付 + キャッシュ対象ファイルのハッシュ)。手動で書き換える必要はない。
// ただしこのフックは `git config core.hooksPath .githooks` を実行した
// リポジトリでのみ有効(新規クローンやCI環境では要手動有効化。詳細は
// .githooks/pre-commit と README.md 参照)。
const CACHE_NAME = "noodle-timer-v20260830-0d1fb5d232";
const ASSETS = [
  "./",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./apple-touch-icon-precomposed.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((res) => {
          // Safari refuses to use a redirected Response for navigation
          // requests ("Response served by service worker has
          // redirections"), so strip the redirect flag before caching
          // or returning it.
          const clean = res.redirected ? new Response(res.body, res) : res;
          const copy = clean.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return clean;
        }).catch(() => cached)
      );
    })
  );
});
