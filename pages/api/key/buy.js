import {checkKey} from '../../../shared/check'
import {Transaction} from '../../../shared/models/transaction'
import {getEpoch, sendRawTx} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'

const TxType = {
  Send: 0,
  Activate: 1,
}

function checkTx(tx) {
  const parsedTx = new Transaction().fromHex(tx)

  if (parsedTx.type !== TxType.Send) throw new Error('tx has invalid type')
}

async function checkForPurchasedKeys(epoch, coinbase) {
  const pool = createPool()

  const keysQuery = await pool.query(
    `
select * from keys 
where coinbase = $1 and epoch = $2`,
    [coinbase, epoch]
  )

  if (keysQuery.rowCount > 4) throw new Error('Your address has exceeded the limit (4 API keys per address)')
}

export default async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  const {coinbase, tx, provider} = req.body
  if (!coinbase || !tx) {
    return res.status(400).send('bad request')
  }

  try {
    checkTx(tx)
    const {epoch} = await getEpoch()

    await checkForPurchasedKeys(epoch, coinbase)

    const pool = createPool()

    const bookQuery = await pool.query(
      `
update keys
set coinbase = $1,
    updated_at = now()
where provider_id = $2 and epoch = $3 and coinbase is null and free = false
returning id, key
`,
      [coinbase, provider, epoch]
    )

    if (!bookQuery.rowCount) {
      return res.status(400).send('no keys left')
    }

    const key = bookQuery.rows[0]

    if (!(await checkKey(key.key, provider))) {
      await pool.query('update keys set coinbase = null where id = $1', [key.id])
      return res.status(400).send('This node is unavailable now. Please try later or select another shared node.')
    }

    let hash = null
    try {
      hash = await sendRawTx(tx)
      await pool.query('update keys set hash = $2, updated_at = now() where id = $1', [key.id, hash])
    } catch (e) {
      // transaction send failed, rollback
      await pool.query('update keys set coinbase = null where id = $1', [key.id])
      return res.status(400).send(e.message)
    }

    return res.status(200).json({id: key.id, txHash: hash})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
