import {query as q} from 'faunadb'
import {Transaction} from '../../../shared/models/transaction'
import {TxType} from '../../../shared/types'
import {serverClient} from '../../../shared/utils/faunadb'
import {checkApiKey, getEpoch, sendRawTx} from '../../../shared/utils/node-api'

const providers = JSON.parse(process.env.IDENA_INVITE_PROVIDERS || '[]')

async function bookFreeKey(coinbase, epoch) {
  try {
    const data = await serverClient.query(
      q.Update(
        q.Select(
          'ref',
          q.Get(
            q.Union(
              providers.map(p =>
                q.Let(
                  {
                    ref: q.Ref(q.Collection('providers'), p),
                  },
                  q.Match(
                    q.Index('search_apikey_by_provider_epoch_free_null_coinbase'),
                    q.Var('ref'),
                    parseInt(epoch),
                    true, // free: true
                    true // coinbase: null
                  )
                )
              )
            )
          )
        ),
        {
          data: {coinbase},
        }
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
  const {coinbase, tx} = req.body
  if (!coinbase || !tx) {
    return res.status(400).send('bad request')
  }

  try {
    checkTx(tx)

    const {epoch} = await getEpoch()

    const booked = await bookFreeKey(coinbase, epoch)
    if (!booked) return res.status(400).send('no keys left')
    const provider = booked.data.providerRef.id

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

    return res.status(200).json({id: booked.data.id, provider})
  } catch (e) {
    return res.status(400).send(`failed to buy api key: ${e.message}`)
  }
}