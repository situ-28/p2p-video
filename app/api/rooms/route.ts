import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"
import { randomCode } from "@/lib/ids"

export async function POST(req: NextRequest) {
  const { rooms } = await getCollections()
  let code = randomCode()
  // try a few times to avoid collision
  for (let i = 0; i < 5; i++) {
    try {
      await rooms.insertOne({
        code,
        createdAt: new Date(),
        status: "waiting",
      })
      return Response.json({ code })
    } catch {
      code = randomCode()
    }
  }
  return new Response("Could not create room", { status: 500 })
}
