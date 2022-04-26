/* eslint-disable no-loop-func */
import {query as q} from 'faunadb'
import {hexToUint8Array} from '../../../shared/utils/buffers'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'
import {getAddrFromSignature} from '../../../shared/utils/signature'

export default async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  const {coinbase, signature} = req.body
  if (!coinbase || !signature) {
    return res.status(400).send('bad request')
  }

  const addr = getAddrFromSignature(hexToUint8Array(coinbase), signature)

  if (addr !== coinbase) {
    return res.status(400).send('bad signature')
  }

  try {
    const {epoch} = await getEpoch()

    const {data} = await serverClient.query(
      q.Map(
        q.Paginate(q.Match(q.Index('search_apikey_by_coinbase_epoch'), coinbase, epoch)),
        q.Lambda(['ref'], q.Get(q.Var('ref')))
      )
    )

    if (!data.length) return res.status(400).send('key not found')

    data.sort((a, b) => a.ts - b.ts)

    const lastKey = data[data.length - 1]

    const provider = await serverClient.query(q.Get(lastKey.data.providerRef))

    return res.status(200).json({
      key: lastKey.data.key,
      url: provider.data.url,
      epoch: lastKey.data.epoch,
      provider: lastKey.data.providerRef.id,
    })
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
