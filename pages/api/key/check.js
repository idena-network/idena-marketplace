import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'

export default async (req, res) => {
  const {key} = req.query
  if (!key) {
    return res.status(400).send('bad request')
  }
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
    if (query.result && query.result.epoch < parseInt(process.env.MIN_AVAILABLE_EPOCH))
      return res.status(400).send('API key is expired. Try to buy another one.')
    return res.json(query.result)
  } catch (e) {
    return res.status(400).send('failed to retrieve api key')
  }
}
