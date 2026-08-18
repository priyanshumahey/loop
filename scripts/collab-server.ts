/**
 * Hocuspocus server for the /teams prototype.
 *
 * Each shared email draft is one Yjs document, keyed by thread id. State lives
 * in memory only — restart the server and every draft resets, which is what we
 * want while the interaction model is still moving.
 *
 * Run with: bun run collab
 */
import { Server } from "@hocuspocus/server"

const port = Number(process.env.COLLAB_PORT ?? 8888)

const server = new Server({
  port,
  quiet: true,

  async onConnect({ documentName }) {
    console.log(`  + client joined ${documentName}`)
  },

  async onDisconnect({ documentName, clientsCount }) {
    console.log(`  - client left ${documentName} (${clientsCount} remaining)`)
  },
})

server.listen().then(() => {
  console.log(`\n  collab server ready on ws://127.0.0.1:${port}`)
  console.log(`  open http://localhost:3000/teams in two windows to test\n`)
})
