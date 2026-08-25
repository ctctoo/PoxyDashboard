const http = require('http')
http
  .get('http://127.0.0.1:9222/json', (res) => {
    let data = ''
    res.on('data', (c) => (data += c))
    res.on('end', () => console.log('RAW:', data.slice(0, 500)))
  })
  .on('error', (e) => console.log('HTTP_ERR:', e.message))
