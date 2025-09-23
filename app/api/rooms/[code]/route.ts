import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const { rooms, roomUsers } = await getCollections()
  const code = params.code.toUpperCase()
  const room = await rooms.findOne({ code })
  if (!room) return new Response("Not found", { status: 404 })

  const users = await roomUsers.find({ roomCode: code }).project({ _id: 0 }).toArray()

  return Response.json({ room, users })
}
