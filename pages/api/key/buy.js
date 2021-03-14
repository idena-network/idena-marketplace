import {query as q} from 'faunadb'
import {serverClient} from '../../../utils/faunadb'
import {getEpoch, sendRawTx} from '../../../utils/node-api'

async function bookKey(coinbase, provider, epoch) {
  try {
    const data = await serverClient.query(
      q.Let(
        {
          ref: q.Ref(q.Collection('providers'), provider),
        },
        q.Update(
          q.Select(
            ['ref'],
            q.Get(
              q.Filter(
                q.Match(q.Index('search_apikey_by_provider'), q.Var('ref')),
                q.Lambda(
                  ['ref', 'epoch', 'coinbase'],
                  q.And(q.Equals(q.Var('epoch'), epoch), q.IsNull(q.Var('coinbase')))
                )
              )
            )
          ),
          {data: {coinbase}}
        )
      )
    )
    return data
  } catch (e) {
    return null
  }
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
    const {epoch} = await getEpoch()
    const booked = await bookKey(coinbase, provider, epoch)
    if (!booked) return res.status(400).send('no keys left')

    try {
      const txHash = await sendRawTx(tx)
      await serverClient.query(
        q.Update(booked.ref, {
          data: {
            hash: txHash,
          },
        })
      )
    } catch (e) {
      // transaction send failed, rollback
      await serverClient.query(
        q.Update(booked.ref, {
          data: {
            coinbase: null,
          },
        })
      )
      return res.status(400).send(`failed to send tx: ${e.message}`)
    }

    return res.status(200).json({id: booked.data.id})
  } catch (e) {
    console.log(e)
    return res.status(400).send('failed to buy api key')
  }
}
