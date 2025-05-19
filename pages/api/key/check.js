import {createPool} from '../../../shared/utils/pg'

export default async (req, res) => {
  const {key} = req.query
  if (!key) {
    return res.status(400).send('bad request')
  }

  const pool = createPool()

  try {
    const result = await pool.query('select * from keys where key = $1', [key])

    const row = result.rows[0]

    return res.json({
      provider: row.provider_id,
      key,
      epoch: row.epoch,
    })
  } catch (e) {
    return res.status(400).send('failed to retrieve api key')
  }
}
