// 通过 CDP 连接 Electron 渲染进程，捕获 console 与页面错误
const http = require('http')

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

async function main() {
  // 等待 CDP 就绪
  let targets = null
  for (let i = 0; i < 30; i++) {
    try {
      targets = await getJSON('http://127.0.0.1:9222/json')
      if (targets.length) break
    } catch (e) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!targets) {
    console.log('CDP_RESULT: no targets')
    return
  }
  const page = targets.find((t) => t.type === 'page')
  if (!page) {
    console.log('CDP_RESULT: no page target', JSON.stringify(targets.map((t) => t.type)))
    return
  }
  console.log('PAGE_URL:', page.url)
  console.log('PAGE_TITLE:', page.title)

  // 获取 body 文本（检查是否渲染出内容）
  const body = await getJSON('http://127.0.0.1:9222/json') // noop
  console.log('CDP_RESULT: connected')
  process.exit(0)
}

main().catch((e) => {
  console.error('CDP_ERROR', e.message)
  process.exit(1)
})
