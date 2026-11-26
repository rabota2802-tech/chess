// Генерируется командой node scripts/cache.js
const assets = {
  "index.html": "68a82ea693b55705fb18022274c7fe7aa5b26ea589bdb84ed942720b41943f23",
  "manifest.webmanifest": "3f3786c066dc16a4e3daa2758b59f020546f4bca6bfe9ea75d9699a59d5fa7d0",
  "style.css": "ded24110286a52209ecd1e529b3aef6df311539c444491489383cbd1184a321f",
  "icon-192.png": "4e6c6a03a9c6bb0d8c156df29b0ca3a1c80dd304730879ed96f9c6b956c1185a",
  "icon-512.png": "ed3b73fdb460089a7e8bd71f1c31e30933d3b66adb4b066df273016361bbcf10",
  "js/app.js": "b91763b331b1f9a3b36a2cac0ef1dc53fca9d694bb931cb4cec0469818125172",
  "js/audio.js": "03946f62023c3fdc39e84cf8e562cf3cccd4b88a5a4798d54e05c6ad3eb60e6c",
  "js/board.js": "9955611c57e0ec1b7682e683fbd9929b86cf687ec96e7c854f7bedf69cf90a27",
  "js/coach.js": "ed260efb993842dd5377ec32838cff708ed76d40b61e3aa72d0a994c274caa9a",
  "js/engine.js": "13a6d411a51d9cdd1412265702b0a8cd2bab3aaeccd2abb6a56cc60a592d7744",
  "js/game.js": "f7d9ea536e704175b64c765ad515548b8b7e18ab48b0deb89fa4ad32497083bd",
  "js/lessons.js": "b0561b8cab8974fb792b865ae5e721f8bf30aecd61d813f8bcd5772a8db09531",
  "js/online.js": "4484e6b990d7e815028a0c71da93cb9d4b11e71fcfe634aad2853bfaa9aaae30",
  "js/rules.js": "669fb623eb1a5369a0d0dd6b19a125c3aa82efaa45943e350ad504d084642d46",
  "js/store.js": "0f4c10e7a6ca3119d2803f6538386cab1a93da22111dde5090e7e6cc69fcc9e9",
  "data/puzzles.json": "8534c4afe011e66e1ac7769a22ebe1a55db604842759213add90331e75a98532",
  "vendor/stockfish/stockfish-17-lite-single.js": "ef06615dc8cf5974e9f3e73d1663b9ca87f2bd59b97e661af0b22e80801b6409",
  "vendor/stockfish/stockfish-17-lite-single.wasm": "8e7d58fd36242f9163fb4881781cbb59b73c2b00067e6f4b02d31a48c58e5fe8"
};
const revision = "352120ddb4be298f734b";
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
