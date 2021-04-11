import axios from 'axios'

function api() {
  const instance = axios.create({
    baseURL: process.env.PROXY_URL,
  })
  instance.interceptors.request.use(function(config) {
    config.data.key = process.env.PROXY_KEY
    return config
  })
  return instance
}

export async function getTx(hash) {
  const {data} = await api().post('/', {
    method: 'bcn_transaction',
    params: [hash],
    id: 1,
  })
  const {result, error} = data
  if (error) throw new Error(error.message)
  return result
}

export async function sendRawTx(hex) {
  const {data} = await api().post('/', {
    method: 'bcn_sendRawTx',
    params: [hex],
    id: 1,
  })
  const {result, error} = data
  if (error) throw new Error(error.message)
  return result
}

export async function getEpoch() {
  const {data} = await api().post('/', {
    method: 'dna_epoch',
    params: [],
    id: 1,
  })
  const {result, error} = data
  if (error) throw new Error(error.message)
  return result
}

export async function checkApiKey(url, key) {
  const {data} = await axios
    .create({
      baseURL: url,
    })
    .post('/', {
      method: 'dna_epoch',
      params: [],
      id: 1,
      key,
    })
  const {result, error} = data
  if (error) throw new Error(error.message)
  return result
}
