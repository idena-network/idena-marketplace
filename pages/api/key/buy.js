import {query as q} from 'faunadb'
import {checkKey} from '../../../shared/check'
import {Transaction} from '../../../shared/models/transaction'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch, sendRawTx} from '../../../shared/utils/node-api'

async function bookKey(coinbase, provider, epoch) {
  try {
    const data = await serverClient.query(
      q.Let(
        {
          provider: q.Ref(q.Collection('providers'), provider),
        },
        q.Do(
          q.Call(q.Function('changePaidCounter'), epoch, q.Var('provider'), -1),
          q.Update(
            q.Select(
              'ref',
              q.Get(
                q.Match(
                  q.Index('search_apikey_by_provider_epoch_is_free_null_coinbase'),
                  q.Var('provider'),
                  epoch,
                  false, // free: false
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

const TxType = {
  Send: 0,
  Activate: 1,
}

function checkTx(tx) {
  const parsedTx = new Transaction().fromHex(tx)

  if (parsedTx.type !== TxType.Send) throw new Error('tx has invalid type')

  // TODO: add provider address check
  // if (parsedTx.to !== process.env.MARKETPLACE_ADDRESS) throw new Error('tx is invalid')
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
    const booked = await bookKey(coinbase, provider, epoch)
    if (!booked) return res.status(400).send('no keys left')

    if (!(await checkKey(booked.data.key, provider))) {
      await serverClient.query(
        q.Do(
          q.Update(booked.ref, {
            data: {
              coinbase: null,
            },
          }),
          q.Call(q.Function('changePaidCounter'), epoch, booked.data.providerRef, 1)
        )
      )
      return res.status(400).send('This node is unavailable now. Please try later or select another shared node.')
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
          q.Call(q.Function('changePaidCounter'), epoch, booked.data.providerRef, 1)
        )
      )
      return res.status(400).send(e.message)
    }

    return res.status(200).json({id: booked.data.id, txHash: hash})
  } catch (e) {
    return res.status(400).send(e.message)
  }
}
