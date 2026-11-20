const CACHE_PREFIX='trucker-cap-estudo-offline-';
const CACHE=CACHE_PREFIX+'1';
const assets=[
  './index.html','./style.css','./estudo.js','./audio-utils.js',
  './faixas.js','./setlist-storage.js','./mp3-worker.js',
  './vendor/lame/lame.min.js','./icon-192.png','./icon-512.png',
  './manifest.webmanifest','./LICENSES.txt','./install.js','./manual-instalacao.html'
];
const base=new URL(self.registration.scope);
const shell=new URL('./index.html',base).href;
const cachedAssets=new Set(assets.map(path=>new URL(path,base).href));
const appPaths=new Set(['','index.html','windows-android','ios-mac'].map(path=>new URL(path,base).pathname));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(assets.map(path=>new Request(new URL(path,base),{cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==base.origin)return;
  const navigation=request.mode==='navigate'&&appPaths.has(url.pathname);
  if(!navigation&&!cachedAssets.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const response=await cache.match(navigation?shell:request);
    return response||fetch(request);
  })());
});
