import {query as q} from 'faunadb'
import {v4 as uuidv4} from 'uuid'
import {serverClient} from '../../../shared/utils/faunadb'
import {getEpoch} from '../../../shared/utils/node-api'

export default async (req, res) => {
  const {epoch} = await getEpoch()
  try {
    for (let i = 0; i < 5; i += 1) {
      await serverClient.query(
        q.Create(q.Collection('api-keys'), {
          data: {
            key: `key-${uuidv4()}-${i}-${epoch}`,
            epoch,
            providerRef: q.Ref(q.Collection('providers'), req.query.provider),
            id: `${uuidv4()}-id-${i}-${epoch}`,
          },
        })
      )
    }

    return res.status(200).send('ok!')
  } catch {
    return res.status(400).send('bad request')
  }
}
