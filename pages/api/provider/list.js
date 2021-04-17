import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

export default async (req, res) => {
  const {epoch} = await getEpoch()
  try {
    const query = await serverClient.query(
      q.Map(
        q.Paginate(q.Documents(q.Collection('providers'))),
        q.Lambda('p', {
          id: q.Select(['id'], q.Var('p')),
          data: q.Select(['data'], q.Get(q.Var('p'))),
          slots: q.Count(
            q.Filter(
              q.Match(q.Index('search_apikey_by_provider'), q.Var('p')),
              q.Lambda(
                ['ref', 'epoch', 'coinbase'],
                q.And(q.Equals(q.Var('epoch'), parseInt(epoch)), q.IsNull(q.Var('coinbase')))
              )
            )
          ),
        })
      )
    )
    return res.json(query.data.filter(x => x.id !== process.env.IDENA_PROVIDER))
  } catch (e) {
    return res.status(400).send('request failed')
  }
}
