import {checkApiKey} from './utils/node-api'
import {createPool} from './utils/pg'
import {godNode} from './utils/utils'

export async function checkInvitationLimit(inviter, epoch) {
  const pool = createPool()

  if (!inviter) {
    throw new Error('the invitation code is missing')
  }

  if (inviter.toLowerCase() === godNode()) {
    return true
  }

  const invitationsQuery = await pool.query(
    `
select count(*)
from keys
where epoch = $1 and inviter = $2`,
    [epoch, inviter]
  )

  if (invitationsQuery.rowCount > 4) {
    throw new Error('inviter has exceeded the limit')
  }

  return true
}

export async function checkKey(key, providerId) {
  try {
    const pool = createPool()

    const providerQuery = await pool.query('select * from providers where id = $1', [providerId])

    const provider = providerQuery.rows[0]

    await checkApiKey(provider.url, key)
    return true
  } catch (e) {
    return false
  }
}
