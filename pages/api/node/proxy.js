const {createProxyMiddleware} = require('http-proxy-middleware')

const proxy = createProxyMiddleware({
  changeOrigin: false,
  secure: false,
  target: process.env.PROXY_URL,
  onProxyReq(proxyReq, req) {
    console.log('changing', process.env.PROXY_KEY)
    const data = JSON.stringify({...req.body, key: process.env.PROXY_KEY})
    proxyReq.setHeader('Content-Length', Buffer.byteLength(data))
    proxyReq.write(data)
  },
  pathRewrite: {
    '^/api/node/proxy': '/',
  },
})

const AVAILABLE_METHODS = ['dna_identity', 'dna_epoch', 'bcn_getRawTx', 'bcn_sendRawTx', 'bcn_transaction']

export default async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  try {
    if (AVAILABLE_METHODS.indexOf(req.body.method) === -1) {
      res.status(403).send('method not available')
      return
    }
    return proxy(req, res)
  } catch (e) {
    return res.status(400).send('request failed')
  }
}
