/* eslint-disable no-loop-func */
import {hexToUint8Array} from '../../../shared/utils/buffers'
import {getEpoch} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'
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

  const pool = createPool()

  try {
    const {epoch} = await getEpoch()

    const keysQuery = await pool.query(
      `
select * from keys 
where coinbase = $1 and epoch = $2 
order by updated_at desc 
limit 1`,
      [coinbase, epoch]
    )

    if (!keysQuery.rowCount) {
      return res.status(400).send('key not found')
    }

    const providerQuery = await pool.query('select * from providers where id = $1', [keysQuery.rows[0].provider_id])

    const key = keysQuery.rows[0]
    const provider = providerQuery.rows[0]

    return res.status(200).json({
      key: key.id,
      url: provider.url,
      epoch: key.epoch,
      provider: provider.id,
    })
  } catch (e) {
    console.log(e)
    return res.status(400).send('failed to get a provider')
  }
}
