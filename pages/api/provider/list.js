import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

export default async (req, res) => {
  const {epoch} = await getEpoch()
  try {
    const query = await serverClient.query(
      q.Map(
        q.Paginate(q.Documents(q.Collection('providers'))),
        q.Lambda(
          'p',
          q.Let(
            {counter: q.Match(q.Index('counters_by_epoch_and_provider'), epoch, q.Var('p'))},
            {
              id: q.Select(['id'], q.Var('p')),
              data: q.Select(['data'], q.Get(q.Var('p'))),
              slots: q.If(q.Exists(q.Var('counter')), q.Select(['data', 'countPaid'], q.Get(q.Var('counter'))), 0),
              inviteSlots: q.If(
                q.Exists(q.Var('counter')),
                q.Select(['data', 'countFree'], q.Get(q.Var('counter'))),
                0
              ),
            }
          )
        )
      )
    )
    return res.json(query.data)
  } catch (e) {
    return res.status(400).send('request failed')
  }
}
