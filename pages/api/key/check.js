import {query as q} from 'faunadb'
import {serverClient} from '../../../utils/faunadb'

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
            result: q.Get(q.Var('ref')),
          },
          {
            result: {data: null},
          }
        )
      )
    )
    return res.json(query.result.data)
  } catch (e) {
    return res.status(400).send('failed to retrieve api key')
  }
}
