import {getEpoch} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'

function parseHeader(req) {
  const auth = req.headers.authorization
  if (!auth) return null
  const spl = auth.split(' ')
  if (spl.length < 2) return null
  return spl[1]
}

const ONE_DAY = 1000 * 60 * 60 * 24

export default async (req, res) => {
  try {
    const {provider} = req.query
    const token = parseHeader(req)
    if (token !== process.env.MANAGER_TOKEN) {
      return res.status(403).send('access denied')
    }

    const {epoch, nextValidation} = await getEpoch()

    const pool = createPool()
    const nextValidationDt = new Date(nextValidation)
    const current = new Date()

    const startEpochRange = nextValidationDt - current > ONE_DAY * 7 ? epoch - 1 : epoch
    const finishEpochRange = epoch + 1
    console.log(startEpochRange, finishEpochRange)
    const keysQuery = await pool.query(
      `
select distinct key
from keys
where provider_id = $1 and epoch between $2 and $3
      `,
      [provider, startEpochRange, finishEpochRange]
    )

    return res.status(200).json(keysQuery.rows.map(x => x.key))
  } catch (e) {
    return res.status(500).send('internal error')
  }
}
