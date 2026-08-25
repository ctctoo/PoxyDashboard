const http = require('http')
const WebSocket = global.WebSocket
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))) }).on('error',reject)
  })
}
function rpc(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const h = (ev) => { const m=JSON.parse(ev.data); if(m.id===id){ ws.removeEventListener('message',h); resolve(m) } }
    ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params }))
  })
}
async function main() {
  let targets
  for (let i=0;i<20;i++){ try { targets=await getJSON('http://127.0.0.1:9222/json'); if(targets.some(t=>t.type==='page')) break } catch(e){} await new Promise(r=>setTimeout(r,1000)) }
  const page = targets?.find(t=>t.type==='page')
  if(!page){ console.log('NO_PAGE'); return }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej })
  await rpc(ws,1,'Runtime.enable',{})
  const errs=[]
  ws.addEventListener('message',(ev)=>{ const m=JSON.parse(ev.data); if(m.method==='Runtime.exceptionThrown') errs.push('EXC:'+JSON.stringify(m.params.exceptionDetails?.exception?.description||'').slice(0,300)) })
  // 读取完整 body
  const body = await rpc(ws,2,'Runtime.evaluate',{expression:`document.body.innerText`, returnByValue:true})
  console.log('FULL_BODY_LENGTH:', (body.result?.result?.value||'').length)
  console.log('MODEL_CARD:', JSON.stringify((body.result?.result?.value||'').slice(300, 900)))
  console.log('ERRORS:', JSON.stringify(errs))
  process.exit(0)
}
main().catch(e=>{ console.error('ERR',e.message); process.exit(1) })
