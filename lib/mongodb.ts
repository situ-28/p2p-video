import { MongoClient, type Db, ServerApiVersion } from "mongodb"

declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.warn("[v0] Missing MONGODB_URI. Set it in Project Settings > Environment Variables.")
}

let client: MongoClient | undefined = global.__mongoClient

async function getClient() {
  if (!client) {
    client = new MongoClient(uri as string, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
    global.__mongoClient = client
    await client.connect()
  }
  return client
}

export async function getDb(dbName = "p2p_calls") {
  const c = await getClient()
  const db = c.db(dbName)
  await ensureIndexes(db)
  return db
}

export type RoomDoc = {
  _id?: any
  code: string
  createdAt: Date
  status: "waiting" | "active" | "ended"
}

export type RoomUserDoc = {
  _id?: any
  roomCode: string
  userId: string
  displayName: string
  joinedAt: Date
  lastActive: Date
}

export type NotificationDoc = {
  _id?: any
  roomCode: string
  type: "ready" | "offer" | "answer" | "candidate" | "bye"
  from: string
  to?: string | null
  payload?: any
  createdAt: Date
  deliveredTo?: string[]
}

async function ensureIndexes(db: Db) {
  const rooms = db.collection<RoomDoc>("rooms")
  const users = db.collection<RoomUserDoc>("room_users")
  const notes = db.collection<NotificationDoc>("notifications")

  await rooms.createIndex({ code: 1 }, { unique: true })
  await users.createIndex({ roomCode: 1 })
  await users.createIndex({ roomCode: 1, userId: 1 }, { unique: true })
  await notes.createIndex({ roomCode: 1, createdAt: 1 })
  await notes.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 6 }) // GC old signals after 6h
}

export async function getCollections(dbName = "p2p_calls") {
  const db = await getDb(dbName)
  return {
    rooms: db.collection<RoomDoc>("rooms"),
    roomUsers: db.collection<RoomUserDoc>("room_users"),
    notifications: db.collection<NotificationDoc>("notifications"),
  }
}
