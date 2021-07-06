import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

const KEY_EXPIRATION_TIMEOUT_MIN = parseInt(process.env.KEY_EXPIRATION_TIMEOUT_MIN || 7 * 24 * 60)

export default async (req, res) => {
  const {key} = req.query
  if (!key) {
    return res.status(400).send('bad request')
  }

  const {epoch, nextValidation} = await getEpoch()

  const expirationDt = new Date(nextValidation)

  expirationDt.setMinutes(expirationDt.getMinutes() - KEY_EXPIRATION_TIMEOUT_MIN)

  try {
    const query = await serverClient.query(
      q.Let(
        {
          ref: q.Match(q.Index('search_apikey_by_key'), key),
        },
        q.If(
          q.Exists(q.Var('ref')),
          {
            result: {
              provider: q.Select(['data', 'providerRef', 'id'], q.Get(q.Var('ref'))),
              key: q.Select(['data', 'key'], q.Get(q.Var('ref'))),
              epoch: q.Select(['data', 'epoch'], q.Get(q.Var('ref'))),
            },
          },
          {
            result: null,
          }
        )
      )
    )

    if (query.result && query.result.epoch < epoch && new Date() > expirationDt) {
      return res.status(400).send('API key is expired. Try to buy another one.')
    }
    return res.json(query.result)
  } catch (e) {
    return res.status(400).send('failed to retrieve api key')
  }
}
