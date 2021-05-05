import {query as q} from 'faunadb'
import {Transaction} from '../../../shared/models/transaction'
import {serverClient} from '../../../shared/utils/faunadb'
import {checkApiKey, getEpoch, sendRawTx} from '../../../shared/utils/node-api'

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

const TxType = {
  Send: 0,
  Activate: 1,
}

function checkTx(tx, provider) {
  const parsedTx = new Transaction().fromHex(tx)

  if (parsedTx.type !== TxType.Activate && parsedTx.type !== TxType.Send) throw new Error('tx has invalid type')

  if (parsedTx.type === TxType.Activate && !JSON.parse(process.env.IDENA_INVITE_PROVIDERS || '[]').includes(provider))
    throw new Error('provider is invalid')

  if (parsedTx.type === TxType.Send && parsedTx.to !== process.env.MARKETPLACE_ADDRESS) throw new Error('tx is invalid')
}

async function checkKey(key, provider) {
  try {
    const result = await serverClient.query(q.Get(q.Ref(q.Collection('providers'), provider)))
    const {url} = result.data
    await checkApiKey(url, key)
    return true
  } catch (e) {
    return false
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
    checkTx(tx, provider)
    const {epoch} = await getEpoch()
    const booked = await bookKey(coinbase, provider, epoch)
    if (!booked) return res.status(400).send('no keys left')

    if (!(await checkKey(booked.data.key, provider))) {
      await serverClient.query(
        q.Update(booked.ref, {
          data: {
            coinbase: null,
          },
        })
      )
      return res.status(400).send('This node is unavailable now. Please try later or select another shared node.')
    }

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
    return res.status(400).send(`failed to buy api key: ${e.message}`)
  }
}
