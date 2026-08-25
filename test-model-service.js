const { app } = require('electron')
const { join } = require('path')

app.whenReady().then(async () => {
  try {
    const { Database } = require(join(__dirname, 'src/main/storage/database'))
    const { LoggerService } = require(join(__dirname, 'src/main/logger'))
    const logger = new LoggerService(join(__dirname, 'test-logs'))
    const db = new Database(logger)
    console.log('DB OK, user_version =', db.db.prepare('PRAGMA user_version').get())

    const { ModelService } = require(join(__dirname, 'src/main/modules/models/service'))
    const models = new ModelService(db, logger)
    const envs = models.detectEnvs()
    console.log('DETECT OK', envs.length, 'envs')
    const added = models.add({ name: '测试', runtime: 'ollama', model: 'qwen2.5:7b', host: '127.0.0.1', port: 11434 })
    console.log('ADD OK', added?.id)
    const list = models.list()
    console.log('LIST OK', list.length)
    const preview = models.previewCommand({ runtime: 'llamacpp', model: 'C:/m/test.gguf', host: '0.0.0.0', port: 8080 })
    console.log('PREVIEW:', preview)
    db.close()
    console.log('ALL OK')
  } catch (e) {
    console.error('FAIL', e)
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
