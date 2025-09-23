import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()
  const { roomUsers, rooms } = await getCollections()
  const { userId, displayName } = (await req.json()) as {
    userId: string
    displayName: string
  }

  const room = await rooms.findOne({ code })
  if (!room) return new Response("Room not found", { status: 404 })

  const existingUsers = await roomUsers.find({ roomCode: code }).toArray()
  if (existingUsers.length >= 2) {
    return new Response("Room full", { status: 409 })
  }

  const doc = {
    roomCode: code,
    userId,
    displayName,
    joinedAt: new Date(),
    lastActive: new Date(),
  }
  await roomUsers.updateOne(
    { roomCode: code, userId },
    { $setOnInsert: doc, $set: { lastActive: new Date() } },
    { upsert: true },
  )

  // determine role deterministically
  const users = await roomUsers.find({ roomCode: code }).toArray()
  const peer = users.find((u) => u.userId !== userId)
  const role = peer && userId > peer.userId ? "callee" : peer ? "caller" : "waiting" // only one user

  return Response.json({
    role,
    users: users.map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
    })),
  })
}

export async function DELETE(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()
  const { roomUsers } = await getCollections()
  const { userId } = (await req.json()) as { userId: string }
  await roomUsers.deleteOne({ roomCode: code, userId })
  return new Response(null, { status: 204 })
}
