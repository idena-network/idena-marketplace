/* eslint-disable no-loop-func */
import {query as q} from 'faunadb'
import {checkInvitationLimit, checkKey} from '../../../shared/check'
import {Transaction} from '../../../shared/models/transaction'
import {TxType} from '../../../shared/types'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch, getIdentity, sendRawTx} from '../../../shared/utils/node-api'
import {shuffle} from '../../../shared/utils/utils'

async function bookFreeKey(provider, coinbase, epoch, inviter) {
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
              data: {coinbase},
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

function checkTx(tx) {
  const parsedTx = new Transaction().fromHex(tx)

  if (parsedTx.type !== TxType.Activate) throw new Error('tx has invalid type')

  return parsedTx
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
    const parsedTx = checkTx(tx)

    const clientProviders = req.body.providers

    if (clientProviders && clientProviders.length === 0) {
      throw new Error('there are no shared nodes available')
    }

    const {epoch} = await getEpoch()
    const inviter = await getInviter(parsedTx.from)

    await checkInvitationLimit(inviter, epoch)

    let availableProviders = await getFreeProviders(epoch)

    // filter providers which are available from client side
    if (clientProviders) {
      availableProviders = availableProviders.filter(x => clientProviders.includes(x))
    }

    shuffle(availableProviders)

    let booked = null
    for (let i = 0; i < availableProviders.length && !booked; i += 1) {
      booked = await bookFreeKey(availableProviders[i], coinbase, epoch, inviter)
      if (booked) {
        if (!(await checkKey(booked.data.key, booked.data.providerRef.id))) {
          await serverClient.query(
            q.Do(
              q.Update(booked.ref, {
                data: {
                  coinbase: null,
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

    let hash = null
    try {
      hash = await sendRawTx(tx)
      await serverClient.query(
        q.Update(booked.ref, {
          data: {
            hash,
          },
        })
      )
    } catch (e) {
      // transaction send failed, rollback
      await serverClient.query(
        q.Do(
          q.Update(booked.ref, {
            data: {
              coinbase: null,
            },
          }),
          q.Call(q.Function('changeFreeCounter'), epoch, booked.data.providerRef, 1),
          q.Call(q.Function('changeInviterCounter'), epoch, inviter, -1)
        )
      )
      return res.status(400).send(e.message)
    }

    return res.status(200).json({id: booked.data.id, provider: booked.data.providerRef.id, txHash: hash})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
