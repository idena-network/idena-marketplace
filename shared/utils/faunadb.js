import faunadb from 'faunadb'

export const serverClient = new faunadb.Client({
  secret: process.env.FAUNADB_SECRET,
})

export const faunaClient = secret =>
  new faunadb.Client({
    secret,
  })
