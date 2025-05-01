const fastify = require('fastify')({ logger: false })
const Database = require('better-sqlite3')
const tiletype = require('@mapbox/tiletype')
const path = require('path')
const { glob } = require('glob')
const tilesDir = __dirname // directory to read mbtiles files
const port = 3000 // port the server runs on
const host = 'localhost' // default listen address

// fastify extensions
fastify.register(require('@fastify/caching'), {
  privacy: 'private',
  expiresIn: 60 * 60 * 24 // 24 hours
})
fastify.register(require('@fastify/cors'))
fastify.register(require('@fastify/rate-limit'), {
  max: 600,
  timeWindow: '1 minute'
})

// create DB connection
function createDB(filePath) {
  return new Database(filePath, {
    readonly: true,
    verbose: null
  })
}


// Tile
fastify.get('/:database/:z/:x/:y', (request, reply) => {
  // make it compatible with the old API
  const database =
    path.extname(request.params.database) === '.mbtiles'
      ? request.params.database
      : request.params.database + '.mbtiles'
  // const y = path.parse(request.params.y).name
  const y = Number(path.parse(request.params.y).name)

  const db = createDB(path.join(tilesDir, database), reply)
  const row = db.prepare(`SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?`)
    .get(request.params.z, request.params.x, (1 << request.params.z) - 1 - y)

  if (!row) {
    reply.code(204).send()
  } else {
    Object.entries(tiletype.headers(row.tile_data)).forEach(h =>
      reply.header(h[0], h[1])
    )
    reply.send(row.tile_data)
  }
})

// MBtiles meta route
fastify.get('/:database/meta', (request, reply) => {
  const dbPath =
    path.extname(request.params.database) === '.mbtiles'
      ? request.params.database
      : request.params.database + '.mbtiles'

  const db = createDB(path.join(tilesDir, dbPath))
  // const db = createDB(path.join(tilesDir, request.params.database), reply)
  const rows = db.prepare(`SELECT name, value FROM metadata where name in ('name', 'attribution','bounds','center', 'description', 'maxzoom', 'minzoom', 'pixel_scale', 'format')`).all()
  !rows ? reply.code(204).send() : reply.send(rows)
})

// MBtiles list
fastify.get('/list', async (request, reply) => {
  try {
    const files = await glob(tilesDir + '/*.mbtiles')
    reply.send(files.map(file => path.basename(file)))
  } catch (err) {
    reply.code(500).send({ error: 'Failed to list mbtiles files' })
  }
})


// Run the server!
fastify.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`tile server listening at ${address}`)
})
