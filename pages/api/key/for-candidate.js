/* eslint-disable no-loop-func */
import {checkInvitationLimit, checkKey} from '../../../shared/check'
import {hexToUint8Array} from '../../../shared/utils/buffers'
import {getEpoch, getIdentity} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'
import {getAddrFromSignature} from '../../../shared/utils/signature'
import {shuffle} from '../../../shared/utils/utils'

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
    const pool = createPool()

    const clientProviders = req.body.providers

    if (clientProviders && clientProviders.length === 0) {
      throw new Error('there are no shared nodes available')
    }

    const {epoch} = await getEpoch()
    const {state, inviter} = await getIdentity(coinbase)

    if (state !== 'Candidate') {
      return res.status(400).send('identity is not a candidate')
    }

    await checkInvitationLimit(inviter?.address, epoch)

    const usedKeyQuery = await pool.query('select * from keys where epoch = $1 and coinbase = $2', [epoch, coinbase])

    if (usedKeyQuery.rowCount) {
      const usedKey = usedKeyQuery.rows[0]
      return res.status(200).json({id: usedKey.id, provider: usedKey.provider_id})
    }

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
with cte as (
    select id
    from keys
    where provider_id = $1 
      and epoch = $2 
      and coinbase is null 
      and free = true
    limit 1
)
update keys
set coinbase = $3,
    inviter = $4,
    mined = true,
    updated_at = now()
where id in (select id from cte)
returning id, key, provider_id;
`,
        [availableProviders[i], epoch, coinbase, inviter?.address]
      )

      if (bookQuery.rowCount) {
        // eslint-disable-next-line prefer-destructuring
        booked = bookQuery.rows[0]
        if (!(await checkKey(booked.key, booked.provider_id))) {
          await pool.query('update keys set coinbase = null, mined = false where id = $1', [booked.id])

          booked = null
        }
      }
    }

    if (!booked) {
      throw new Error('no keys left')
    }

    return res.status(200).json({id: booked.id, provider: booked.provider_id})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
