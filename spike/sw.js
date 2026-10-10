self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  if(u.includes('telegram.org'))return;
  e.respondWith((async()=>{
    for(const name of ['spike-tiles','spike-app']){const c=await caches.open(name);const r=await c.match(e.request,{ignoreSearch:true});if(r)return r}
    return fetch(e.request);
  })());
});
