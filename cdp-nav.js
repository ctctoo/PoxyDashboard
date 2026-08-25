// 通过 CDP 导航到「本地模型」页面并捕获渲染错误
const http = require('http')
const WebSocket = global.WebSocket

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      .on('error', reject)
  })
}

function rpc(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const handler = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === id) {
        ws.removeEventListener('message', handler)
        resolve(msg)
      }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  let targets
  for (let i = 0; i < 20; i++) {
    try {
      targets = await getJSON('http://127.0.0.1:9222/json')
      if (targets.some((t) => t.type === 'page')) break
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) {
    console.log('NO_PAGE')
    return
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  const errors = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params))
    }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      errors.push('CONSOLE[' + msg.params.type + ']: ' + (msg.params.args || []).map((a) => a.value || a.description || '').join(' '))
    }
  })

  await rpc(ws, 1, 'Runtime.enable', {})
  await rpc(ws, 2, 'Page.enable', {})

  // 导航到 models：点击侧栏按钮「本地模型」
  const click = await rpc(ws, 3, 'Runtime.evaluate', {
    expression: `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('本地模型')); if(!b) return 'NO_BTN:'+document.body.innerText.slice(0,200); b.click(); return 'clicked' })()`,
    returnByValue: true
  })
  console.log('NAV_CLICK:', JSON.stringify(click.result?.result?.value))

  await new Promise((r) => setTimeout(r, 2000))

  const body = await rpc(ws, 4, 'Runtime.evaluate', {
    expression: `document.body.innerText.slice(0, 500)`,
    returnByValue: true
  })
  console.log('BODY:', JSON.stringify(body.result?.result?.value))

  console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)))
  process.exit(0)
}

main().catch((e) => {
  console.error('CDP_ERROR', e.message)
  process.exit(1)
})
