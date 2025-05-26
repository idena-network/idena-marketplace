import {getTx} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'

const HASH_IN_MEMPOOL = '0x0000000000000000000000000000000000000000000000000000000000000000'

export default async (req, res) => {
  const {id} = req.query
  if (!id) {
    return res.status(400).send('bad request')
  }
  const pool = createPool()
  try {
    const result = await pool.query('select * from keys where id = $1', [id])

    if (!result.rowCount) {
      return res.status(400).send('key not found')
    }

    const key = result.rows[0]

    let {mined} = key

    if (!mined) {
      const tx = await getTx(key.hash)

      if (tx && tx.blockHash !== HASH_IN_MEMPOOL) {
        // set mined
        await pool.query('update keys set mined = true where id = $1', [id])
        mined = true
      }
    }

    if (mined) {
      return res.status(200).json({key: key.key, epoch: key.epoch})
    }

    return res.status(400).send('tx is not mined')
  } catch (e) {
    return res.status(400).send('failed to retrieve api key')
  }
}
