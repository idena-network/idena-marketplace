import {query as q} from 'faunadb'
import {serverClient} from '../../../utils/faunadb'
import {getTx} from '../../../utils/node-api'

const HASH_IN_MEMPOOL = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default async (req, res) => {
  const {id} = req.query
  if (!id) {
    return res.status(400).send('bad request')
  }
  try {
    const {result: keyObj} = await serverClient.query(
      q.Let(
        {
          ref: q.Match(q.Index('search_apikey_by_id'), id),
        },
        q.If(
          q.Exists(q.Var('ref')),
          {
            result: q.Get(q.Var('ref')),
          },
          {
            result: null,
          }
        )
      )
    )

    if (!keyObj) {
      return res.status(400).send('key not found')
    }

    if (!keyObj.data.mined) {
      console.log(keyObj.data.hash)
      const tx = await getTx(keyObj.data.hash)

      if (tx && tx.blockHash !== HASH_IN_MEMPOOL) {
        // set mined
        await serverClient.query(
          q.Update(keyObj.ref, {
            data: {
              mined: true,
            },
          })
        )
        keyObj.data.mined = true
      }
    }

    if (keyObj.data.mined) {
      return res.status(200).json({key: keyObj.data.key, epoch: keyObj.data.epoch})
    }

    return res.status(400).send('tx is not mined')
  } catch (e) {
    console.log(e)
    return res.status(400).send('failed to retrieve api key')
  }
}
