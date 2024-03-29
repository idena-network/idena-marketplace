/* eslint-disable no-loop-func */
import {query as q} from 'faunadb'
import {checkInvitationLimit, checkKey} from '../../../shared/check'
import {hexToUint8Array} from '../../../shared/utils/buffers'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch, getIdentity} from '../../../shared/utils/node-api'
import {getAddrFromSignature} from '../../../shared/utils/signature'
import {shuffle} from '../../../shared/utils/utils'

async function bookFreeKeyForCandidate(provider, coinbase, epoch, inviter) {
  try {
    const data = await serverClient.query(
      q.Let(
        {
          provider: q.Ref(q.Collection('providers'), provider),
        },
        q.Do(
          q.Call(q.Function('changeFreeCounter'), epoch, q.Var('provider'), -1),
          q.Call(q.Function('changeInviterCounter'), epoch, inviter, 1),
          q.Update(
            q.Select(
              'ref',
              q.Get(
                q.Match(
                  q.Index('search_apikey_by_provider_epoch_is_free_null_coinbase'),
                  q.Var('provider'),
                  epoch,
                  true, // free: true
                  true // coinbase: null
                )
              )
            ),
            {
              data: {coinbase, mined: true},
            }
          )
        )
      )
    )

    return data
  } catch (e) {
    return null
  }
}

async function getFreeProviders(epoch) {
  const {data} = await serverClient.query(
    q.Map(
      q.Paginate(q.Match(q.Index('free_providers_by_epoch'), epoch, true)),
      q.Lambda(['ref', 'countFree', 'countPaid'], q.Select(['id'], q.Var('ref')))
    )
  )
  return data
}

async function searchForUsedKey(epoch, coinbase) {
  try {
    const {data} = await serverClient.query(q.Get(q.Match(q.Index('search_apikey_by_coinbase_epoch'), coinbase, epoch)))
    return data
  } catch {
    return null
  }
}

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

    const usedKey = await searchForUsedKey(epoch, coinbase)

    if (usedKey) {
      return res.status(200).json({id: usedKey.id, provider: usedKey.providerRef.id})
    }

    let availableProviders = await getFreeProviders(epoch)

    // filter providers which are available from client side
    if (clientProviders) {
      availableProviders = availableProviders.filter(x => clientProviders.includes(x))
    }

    shuffle(availableProviders)

    let booked = null
    for (let i = 0; i < availableProviders.length && !booked; i += 1) {
      booked = await bookFreeKeyForCandidate(availableProviders[i], coinbase, epoch, inviter?.address)
      if (booked) {
        if (!(await checkKey(booked.data.key, booked.data.providerRef.id))) {
          await serverClient.query(
            q.Do(
              q.Update(booked.ref, {
                data: {
                  coinbase: null,
                  mined: null,
                },
              }),
              q.Call(q.Function('changeFreeCounter'), epoch, booked.data.providerRef, 1),
              q.Call(q.Function('changeInviterCounter'), epoch, inviter, -1)
            )
          )

          booked = null
        }
      }
    }

    if (!booked) {
      throw new Error('no keys left')
    }

    return res.status(200).json({id: booked.data.id, provider: booked.data.providerRef.id})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
