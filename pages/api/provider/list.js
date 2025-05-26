import {getEpoch} from '../../../shared/utils/node-api'
import {createPool} from '../../../shared/utils/pg'

export default async (req, res) => {
  const {epoch} = await getEpoch()

  const pool = createPool()

  try {
    const result = await pool.query(
      `
with cte as (
	select provider_id, sum(case when free = false then 1 else 0 end) as paid, sum(case when free = true then 1 else 0 end) as free
	from keys
	where epoch = $1
	group by provider_id
)
select p.*, cte.paid, cte.free
from providers p inner join cte on cte.provider_id = p.id`,
      [epoch]
    )

    return res.json(
      result.rows.map(item => ({
        id: item.id,
        data: {
          url: item.url,
          ownerName: item.ownerName,
          price: item.price,
          location: item.location,
          address: item.address,
          prices: [1, 3, 5],
        },
        slots: item.paid,
        inviteSlots: item.free,
      }))
    )
  } catch (e) {
    console.log(e)
    return res.status(400).send('failed to get a provider')
  }
}
