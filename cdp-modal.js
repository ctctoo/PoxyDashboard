const http = require('http')
const WebSocket = global.WebSocket
function getJSON(url){return new Promise((res,rej)=>{http.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)))}).on('error',rej)})}
function rpc(ws,id,method,params){return new Promise((res,rej)=>{const h=ev=>{const m=JSON.parse(ev.data);if(m.id===id){ws.removeEventListener('message',h);res(m)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id,method,params}))})}
async function main(){
  let targets
  for(let i=0;i<20;i++){try{targets=await getJSON('http://127.0.0.1:9222/json');if(targets.some(t=>t.type==='page'))break}catch(e){}await new Promise(r=>setTimeout(r,1000))}
  const page=targets?.find(t=>t.type==='page'); if(!page){console.log('NO_PAGE');return}
  const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej})
  await rpc(ws,1,'Runtime.enable',{})
  const errs=[]
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.method==='Runtime.exceptionThrown')errs.push('EXC:'+JSON.stringify(m.params.exceptionDetails?.exception?.description||'').slice(0,300))})
  // 导航到 models
  await rpc(ws,2,'Runtime.evaluate',{expression:`[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('本地模型'))?.click()`,returnByValue:true})
  await new Promise(r=>setTimeout(r,1200))
  // 点击「添加模型」
  await rpc(ws,3,'Runtime.evaluate',{expression:`[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('添加模型'))?.click()`,returnByValue:true})
  await new Promise(r=>setTimeout(r,1000))
  const modal = await rpc(ws,4,'Runtime.evaluate',{expression:`document.body.innerText.includes('添加本地模型') ? 'MODAL_OPEN' : 'MODAL_NOT_FOUND:'+document.body.innerText.slice(0,150)`,returnByValue:true})
  console.log('MODAL:', modal.result?.result?.value)
  // 切换框架选择，测试 envFor / 默认端口
  await rpc(ws,5,'Runtime.evaluate',{expression:`[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('llama.cpp'))?.click()`,returnByValue:true})
  await new Promise(r=>setTimeout(r,800))
  const port = await rpc(ws,6,'Runtime.evaluate',{expression:`(()=>{const i=[...document.querySelectorAll('input')].find(x=>x.type==='number');return i?i.value:'NO_PORT'})()`,returnByValue:true})
  console.log('PORT_AFTER_SWITCH:', port.result?.result?.value)
  console.log('ERRORS:', JSON.stringify(errs.slice(0,5)))
  process.exit(0)
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1)})
