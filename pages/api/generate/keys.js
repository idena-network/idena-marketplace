import {query as q} from 'faunadb'
import {serverClient} from '../../../utils/faunadb'
import {getEpoch} from '../../../utils/node-api'

export default async (req, res) => {
  const {epoch} = await getEpoch()
  try {
    for (let i = 0; i < 10; i += 1) {
      await serverClient.query(
        q.Create(q.Collection('api-keys'), {
          data: {
            key: `apikey-${i}-${epoch}`,
            epoch,
            providerRef: q.Ref(q.Collection('providers'), '290764832667337223'),
            id: `guid-id-${i}-${epoch}`,
          },
        })
      )
    }

    return res.status(200).send('ok!')
  } catch {
    return res.status(400).send('bad request')
  }
}
