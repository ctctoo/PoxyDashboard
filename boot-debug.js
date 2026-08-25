// 用 RUN_AS_NODE 验证构建产物能否被加载（不触发 GUI）
process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT', e.message, e.stack)
  process.exit(2)
})
process.on('unhandledRejection', (r) => {
  console.error('UNHANDLED_REJECTION', r)
})
try {
  console.error('DEBUG loading out/main/index.js as node...')
  require('./out/main/index.js')
  console.error('DEBUG loaded OK')
} catch (e) {
  console.error('DEBUG LOAD ERROR', e.message)
  console.error(e.stack)
}
