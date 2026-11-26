// Генерируется командой node scripts/cache.js
const assets = {
  "index.html": "f436de2759d6fe226ab692576f652ed0924f9930622f9bb31ce085f7b27ea2a0",
  "manifest.webmanifest": "3f3786c066dc16a4e3daa2758b59f020546f4bca6bfe9ea75d9699a59d5fa7d0",
  "style.css": "ded24110286a52209ecd1e529b3aef6df311539c444491489383cbd1184a321f",
  "icon-192.png": "4e6c6a03a9c6bb0d8c156df29b0ca3a1c80dd304730879ed96f9c6b956c1185a",
  "icon-512.png": "ed3b73fdb460089a7e8bd71f1c31e30933d3b66adb4b066df273016361bbcf10",
  "js/app.js": "6964c7a55021a66b4ad8071da3f15cd7d93f6158cca02bd37460fdf5ed884cf3",
  "js/audio.js": "03946f62023c3fdc39e84cf8e562cf3cccd4b88a5a4798d54e05c6ad3eb60e6c",
  "js/board.js": "9955611c57e0ec1b7682e683fbd9929b86cf687ec96e7c854f7bedf69cf90a27",
  "js/coach.js": "183348bdade2fbb9dd8740d0dac90391ce841533519af6e5f1ac4c595d1a6ec4",
  "js/engine.js": "8663715860877f34aa0ecf9b28a0c49add99a5ec1de2ace8a10e5c775742b0a0",
  "js/game.js": "2873c075631a8352af769dad26fa013b54e1d706ed8832dc004f91c82a73036d",
  "js/lessons.js": "b0561b8cab8974fb792b865ae5e721f8bf30aecd61d813f8bcd5772a8db09531",
  "js/online.js": "f2e7dea223697d81bdc6db6c449454b3bdb1ffc3aac8b2663d1250ba39ae96dd",
  "js/rules.js": "669fb623eb1a5369a0d0dd6b19a125c3aa82efaa45943e350ad504d084642d46",
  "js/store.js": "8fd2eb1ffe65a80159fbc577f6b91b4a99f004fbff706fa877bff9b847c95e67",
  "data/puzzles.json": "8534c4afe011e66e1ac7769a22ebe1a55db604842759213add90331e75a98532",
  "vendor/stockfish/stockfish-17-lite-single.js": "ef06615dc8cf5974e9f3e73d1663b9ca87f2bd59b97e661af0b22e80801b6409",
  "vendor/stockfish/stockfish-17-lite-single.wasm": "8e7d58fd36242f9163fb4881781cbb59b73c2b00067e6f4b02d31a48c58e5fe8"
};
const revision = "dc43e7a11c02749c31b8";
const scope=self.registration.scope;
const prefix='chess:'+scope+':';
const cacheName=prefix+revision;
const url=file=>new URL(file,scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(cacheName);
 try{for(const [file,expected] of Object.entries(assets)){
 const response=await fetch(url(file),{cache:'reload',credentials:'same-origin'});
 if(!response.ok)throw Error(file);
 const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
 const actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 if(actual!==expected)throw Error('Контрольная сумма: '+file);
 await cache.put(url(file),response);
 }}catch(err){await caches.delete(cacheName);throw err;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{const r=event.request;if(r.method!=='GET'||!r.url.startsWith(scope))return;
 let file=r.url.slice(scope.length);if(!file||file.startsWith('?'))file='index.html';
 if(!Object.hasOwn(assets,file))return;
 event.respondWith(caches.open(cacheName).then(async c=>(await c.match(url(file)))||fetch(r)));
});
self.addEventListener('message',event=>{if(event.data!=='verify')return;
 event.waitUntil(caches.open(cacheName).then(async c=>event.ports[0]?.postMessage({ready:(await Promise.all(Object.keys(assets).map(f=>c.match(url(f))))).every(Boolean)})));
});
