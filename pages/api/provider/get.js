import {getEpoch} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'

export default async (req, res) => {
  const {id} = req.query
  if (!id) {
    return res.status(400).send('bad request')
  }
  const {epoch} = await getEpoch()

  const pool = createPool()

  try {
    const result = await pool.query('select * from providers where id = $1', [id])

    const counter = await pool.query(
      'select count(*) from keys where provider_id = $1 and epoch = $2 and free = false',
      [id, epoch]
    )

    const row = result.rows[0]

    const counterRow = counter.rows[0]
    return res.json({
      id,
      data: row,
      slots: counterRow.count,
    })
  } catch (e) {
    console.log(e)
    return res.status(400).send('failed to get a provider')
  }
}
