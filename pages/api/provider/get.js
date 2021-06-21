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
          slots: q.Let(
            {
              counter: q.Match(q.Index('counters_by_epoch_and_provider'), epoch, q.Var('ref')),
            },
            q.If(q.Exists(q.Var('counter')), q.Select(['data', 'countPaid'], q.Get(q.Var('counter'))), 0)
          ),
        }
      )
    )
    return res.json(result)
  } catch (e) {
    return res.status(400).send('failed to get a provider')
  }
}
