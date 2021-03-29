import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

export default async (req, res) => {
  const {id} = req.query
  if (!id) {
    return res.status(400).send('bad request')
  }
  const {epoch} = await getEpoch()
  try {
    const result = await serverClient.query(
      q.Let(
        {
          ref: q.Ref(q.Collection('providers'), id),
        },
        {
          id: q.Select(['id'], q.Var('ref')),
          data: q.Select(['data'], q.Get(q.Var('ref'))),
          slots: q.Count(
            q.Filter(
              q.Match(q.Index('search_apikey_by_provider'), q.Var('ref')),
              q.Lambda(
                ['ref', 'epoch', 'coinbase'],
                q.And(q.Equals(q.Var('epoch'), parseInt(epoch)), q.IsNull(q.Var('coinbase')))
              )
            )
          ),
        }
      )
    )
    return res.json(result)
  } catch (e) {
    return res.status(400).send('failed to get a provider')
  }
}
