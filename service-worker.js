const CACHE='safe-site-team-permissions-v1';
const STATIC_ASSETS=['./manifest.webmanifest','./icon-192.svg','./icon-512.svg'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.mode==='navigate' || url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/app.js') || url.pathname.endsWith('/pilot-management.js') ||
     url.pathname.endsWith('/team-permissions.js')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req))
      .then(resp=>resp || caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(req).then(resp=>{
    if(req.method==='GET' && resp && resp.ok){
      const copy=resp.clone(); caches.open(CACHE).then(cache=>cache.put(req,copy));
    }
    return resp;
  }).catch(()=>caches.match(req)));
});