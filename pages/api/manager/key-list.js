import {query as q} from 'faunadb'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

function parseHeader(req) {
  const auth = req.headers.authorization
  if (!auth) return null
  const spl = auth.split(' ')
  if (spl.length < 2) return null
  return spl[1]
}

export default async (req, res) => {
  try {
    const token = parseHeader(req)
    if (token !== process.env.MANAGER_TOKEN) {
      return res.status(403).send('access denied')
    }

    const {epoch} = await getEpoch()

    const result = await serverClient.query(
      q.Map(
        q.Paginate(
          q.Filter(
            q.Match(q.Index('search_apikey_by_epoch')),
            q.Lambda(['ref', 'epoch'], q.GTE(q.Var('epoch'), epoch - 1))
          ),
          {
            size: 100000,
          }
        ),
        q.Lambda(['ref', 'epoch'], q.Select(['data', 'key'], q.Get(q.Var('ref'))))
      )
    )

    return res.status(200).json(result.data)
  } catch (e) {
    console.log(e)
    return res.status(500).send('internal error')
  }
}
