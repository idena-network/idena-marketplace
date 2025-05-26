/* eslint-disable no-loop-func */
import {checkInvitationLimit, checkKey} from '../../../shared/check'
import {Transaction} from '../../../shared/models/transaction'
import {TxType} from '../../../shared/types'
import {getEpoch, getIdentity, sendRawTx} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'
import {shuffle} from '../../../shared/utils/utils'

function checkTx(tx) {
  const parsedTx = new Transaction().fromHex(tx)

  if (parsedTx.type !== TxType.Activate) throw new Error('tx has invalid type')

  return parsedTx
}

async function getInviter(from) {
  const invitation = await getIdentity(from)
  return invitation?.inviter?.address
}

export default async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  const {coinbase, tx} = req.body
  if (!coinbase || !tx) {
    return res.status(400).send('bad request')
  }

  try {
    const pool = createPool()
    const parsedTx = checkTx(tx)

    const clientProviders = req.body.providers

    if (clientProviders && clientProviders.length === 0) {
      throw new Error('there are no shared nodes available')
    }

    const {epoch} = await getEpoch()
    const inviter = await getInviter(parsedTx.from)

    await checkInvitationLimit(inviter, epoch)

    const availableProvidersQuery = await pool.query(
      `
select provider_id
from keys
where epoch = $1 
group by provider_id
having sum(case when free then 1 else 0 end) > 0`,
      [epoch]
    )

    let availableProviders = availableProvidersQuery.rows.map(x => x.provider_id)

    // filter providers which are available from client side
    if (clientProviders) {
      availableProviders = availableProviders.filter(x => clientProviders.includes(x))
    }

    shuffle(availableProviders)

    let booked = null
    for (let i = 0; i < availableProviders.length && !booked; i += 1) {
      const bookQuery = await pool.query(
        `
update keys
set coinbase = $3,
    inviter = $4,
    updated_at = now()
where provider_id = $1 and epoch = $2 and coinbase is null and free = true
returning id, key, provider_id
`,
        [availableProviders[i], epoch, coinbase, inviter]
      )

      if (bookQuery.rowCount) {
        // eslint-disable-next-line prefer-destructuring
        booked = bookQuery.rows[0]

        if (!(await checkKey(booked.key, booked.provider_id))) {
          await pool.query('update keys set coinbase = null where id = $1', [booked.id])

          booked = null
        }
      }
    }

    if (!booked) {
      throw new Error('no keys left')
    }

    let hash = null
    try {
      hash = await sendRawTx(tx)
      await pool.query('update keys set hash = $2 where id = $1', [booked.id, hash])
    } catch (e) {
      // transaction send failed, rollback
      await pool.query('update keys set coinbase = null where id = $1', [booked.id])
      return res.status(400).send(e.message)
    }

    return res.status(200).json({id: booked.id, provider: booked.provider_id, txHash: hash})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
