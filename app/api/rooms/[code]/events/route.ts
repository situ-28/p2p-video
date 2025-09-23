import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"

const TIMEOUT_MS = 25000
const TICK_MS = 800

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()
  const { notifications } = await getCollections()
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  const since = Number(searchParams.get("since") || "0")

  if (!userId) return new Response("Missing userId", { status: 400 })

  const endAt = Date.now() + TIMEOUT_MS

  while (Date.now() < endAt) {
    const events = await notifications
      .find({
        roomCode: code,
        createdAt: { $gt: new Date(since || 0) },
        from: { $ne: userId },
        $or: [{ to: null }, { to: userId }],
        $expr: {
          $not: [{ $in: [userId, { $ifNull: ["$deliveredTo", []] }] }],
        },
      })
      .sort({ createdAt: 1 })
      .limit(25)
      .toArray()

    if (events.length > 0) {
      const ids = events.map((e) => e._id)
      await notifications.updateMany({ _id: { $in: ids } }, { $addToSet: { deliveredTo: userId } })

      return Response.json({
        now: Date.now(),
        events: events.map((e) => ({
          type: e.type,
          from: e.from,
          to: e.to ?? null,
          payload: e.payload,
          createdAt: e.createdAt,
        })),
      })
    }

    // brief pause
    await new Promise((r) => setTimeout(r, TICK_MS))
  }

  return Response.json({ now: Date.now(), events: [] })
}
