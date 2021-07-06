import {query as q} from 'faunadb'
import {godNode} from './utils/utils'
import {serverClient} from './utils/faunadb'
import {checkApiKey} from './utils/node-api'

export async function checkInvitationLimit(inviter, epoch) {
  if (!inviter) {
    throw new Error('invalid tx')
  }

  if (inviter.toLowerCase() === godNode()) {
    return true
  }

  const {data} = await serverClient.query(
    q.Let(
      {
        counter: q.Match(q.Index('invitation_counters_by_inviter_epoch'), inviter, epoch),
      },
      q.If(q.IsEmpty(q.Var('counter')), {data: {count: 0}}, q.Get(q.Var('counter')))
    )
  )

  if (data.count > 4) throw new Error('inviter has exceeded the limit')

  return true
}

export async function checkKey(key, provider) {
  try {
    const result = await serverClient.query(q.Get(q.Ref(q.Collection('providers'), provider)))
    const {url} = result.data
    await checkApiKey(url, key)
    return true
  } catch (e) {
    return false
  }
}
