"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { randomUserId } from "@/lib/ids"

type EventMsg = {
  type: "ready" | "offer" | "answer" | "candidate" | "bye"
  from: string
  to?: string | null
  payload?: any
  createdAt: string | Date
}

const fetchJSON = async (input: RequestInfo, init?: RequestInit) => {
  const res = await fetch(input, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || "Request failed")
  }
  const ct = res.headers.get("content-type") || ""
  return ct.includes("application/json") ? res.json() : null
}

export function RoomCall({ code }: { code: string }) {
  const [displayName, setDisplayName] = useState<string>("")
  const userId = useMemo(() => {
    // sticky per-tab identity
    if (typeof window === "undefined") return randomUserId()
    const persisted = sessionStorage.getItem("userId")
    if (persisted) return persisted
    const id = randomUserId()
    sessionStorage.setItem("userId", id)
    return id
  }, [])

  const [joined, setJoined] = useState(false)
  const [role, setRole] = useState<"caller" | "callee" | "waiting" | null>(null)
  const [status, setStatus] = useState<"idle" | "joining" | "ready" | "connecting" | "connected" | "ended">("idle")

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const sinceRef = useRef<number>(0)
  const peerIdRef = useRef<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)

  // heartbeat SWR
  useSWR(
    joined ? [`heartbeat`, code, userId] : null,
    async () => {
      await fetch(`/api/rooms/${code}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ userId }),
        headers: { "content-type": "application/json" },
      })
      return true
    },
    { refreshInterval: joined ? 10000 : 0, revalidateOnFocus: false },
  )

  const startMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: 1280, height: 720 },
    })
    localStreamRef.current = stream
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
  }, [])

  const ensurePC = useCallback(() => {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) {
        void fetch(`/api/rooms/${code}/signal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "candidate",
            from: userId,
            to: peerIdRef.current,
            payload: e.candidate.toJSON(),
          }),
        })
      }
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (remoteVideoRef.current && stream) {
        remoteVideoRef.current.srcObject = stream
      }
    }

    // attach local tracks
    localStreamRef.current?.getTracks().forEach((t) => {
      pc.addTrack(t, localStreamRef.current!)
    })

    return pc
  }, [code, userId])

  const cleanupPC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null
      pcRef.current.onicecandidate = null
      pcRef.current.getSenders().forEach((s) => {
        try {
          pcRef.current?.removeTrack(s)
        } catch {}
      })
      pcRef.current.close()
      pcRef.current = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
  }, [])

  const leaveRoom = useCallback(async () => {
    try {
      await fetch(`/api/rooms/${code}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "bye", from: userId, to: peerIdRef.current }),
      })
    } catch {}
    try {
      await fetch(`/api/rooms/${code}/join`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      })
    } catch {}
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setStatus("ended")
    setJoined(false)
    setRole(null)
    peerIdRef.current = null
    cleanupPC()
  }, [cleanupPC, code, userId])

  useEffect(() => {
    const beforeUnload = () => {
      navigator.sendBeacon(`/api/rooms/${code}/join`, JSON.stringify({ userId }))
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
    }
  }, [code, userId])

  // Join room once user presses Start Call (to satisfy autoplay policies)
  const { isValidating: joining } = useSWR(
    status === "joining" ? ["join", code, userId, displayName] : null,
    async () => {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          displayName: displayName || `Guest-${userId.slice(-4)}`,
        }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || "Join failed")
      }
      const data = await res.json()
      setRole(data.role)
      const other = (data.users as Array<{ userId: string }>).find((u) => u.userId !== userId)
      peerIdRef.current = other?.userId ?? null
      setJoined(true)
      setStatus("ready")

      // announce readiness
      await fetch(`/api/rooms/${code}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "ready", from: userId, to: peerIdRef.current }),
      })
      return true
    },
    { revalidateOnFocus: false },
  )

  // Long-poll events with SWR chaining
  useSWR(
    joined ? ["events", code, userId] : null,
    async () => {
      const url = new URL(window.location.origin + `/api/rooms/${code}/events`)
      url.searchParams.set("userId", userId)
      url.searchParams.set("since", String(sinceRef.current || 0))
      const res = await fetch(url.toString(), { cache: "no-store" })
      if (!res.ok) throw new Error("events failed")
      const data = (await res.json()) as { now: number; events: EventMsg[] }
      sinceRef.current = data.now
      // Handle events in order
      for (const ev of data.events) {
        await handleEvent(ev)
      }
      return data.now
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 0,
      refreshInterval: 0, // chaining only
      onSuccess: () => {
        // trigger the next long-poll immediately
      },
      onErrorRetry: (_err, _key, _config, revalidate, { retryCount }) => {
        const timeout = Math.min(2000 * (retryCount + 1), 8000)
        setTimeout(() => revalidate({ retryCount }), timeout)
      },
    },
  )

  const handleEvent = useCallback(
    async (ev: EventMsg) => {
      if (ev.type === "ready") {
        if (!peerIdRef.current) {
          peerIdRef.current = ev.from
        }
        // Decide initiator deterministically to avoid glare
        const iAmCaller = role ? role === "caller" : userId < (peerIdRef.current || "")
        if (iAmCaller) {
          setStatus("connecting")
          const pc = ensurePC()
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          })
          await pc.setLocalDescription(offer)
          await fetch(`/api/rooms/${code}/signal`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "offer",
              from: userId,
              to: peerIdRef.current,
              payload: offer,
            }),
          })
        }
      } else if (ev.type === "offer") {
        setStatus("connecting")
        const pc = ensurePC()
        await pc.setRemoteDescription(new RTCSessionDescription(ev.payload))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await fetch(`/api/rooms/${code}/signal`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "answer",
            from: userId,
            to: ev.from,
            payload: answer,
          }),
        })
      } else if (ev.type === "answer") {
        const pc = ensurePC()
        await pc.setRemoteDescription(new RTCSessionDescription(ev.payload))
        setStatus("connected")
      } else if (ev.type === "candidate") {
        const pc = ensurePC()
        try {
          await pc.addIceCandidate(new RTCIceCandidate(ev.payload))
        } catch (e) {
          // ignore out-of-order
        }
      } else if (ev.type === "bye") {
        setStatus("ended")
        cleanupPC()
      }
    },
    [cleanupPC, code, ensurePC, role, userId],
  )

  const onStart = useCallback(async () => {
    try {
      setStatus("joining")
      await startMedia()
    } catch (e: any) {
      alert("Failed to access camera/mic: " + e?.message)
      setStatus("idle")
      return
    }
  }, [startMedia])

  // When local stream changes, (re)attach to pc if exists
  useEffect(() => {
    const pc = pcRef.current
    if (!pc || !localStreamRef.current) return
    const senders = pc.getSenders()
    for (const track of localStreamRef.current.getTracks()) {
      const sender = senders.find((s) => s.track?.kind === track.kind)
      if (sender) sender.replaceTrack(track)
      else pc.addTrack(track, localStreamRef.current)
    }
  }, [joined, localStreamRef.current])

  const toggleMute = () => {
    const tracks = localStreamRef.current?.getAudioTracks() || []
    tracks.forEach((t) => (t.enabled = !t.enabled))
    setMuted(!muted)
  }

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks() || []
    tracks.forEach((t) => (t.enabled = !t.enabled))
    setCameraOff(!cameraOff)
  }

  const startScreenShare = async () => {
    if (screenSharing) return
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
      })
      const screenTrack = stream.getVideoTracks()[0]
      const pc = pcRef.current
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video")
      await sender?.replaceTrack(screenTrack)
      setScreenSharing(true)
      screenTrack.onended = async () => {
        // restore camera
        const camTrack = localStreamRef.current?.getVideoTracks().find((t) => t.kind === "video")
        if (camTrack) await sender?.replaceTrack(camTrack)
        setScreenSharing(false)
      }
    } catch (e: any) {
      console.log("[v0] Screen share error:", e?.message)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        <div className="flex-1 rounded-lg border overflow-hidden bg-black/80 aspect-video">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        </div>
        <div className="w-full md:w-80 grid gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-sm font-medium mb-2">Your preview</div>
            <div className="rounded-md overflow-hidden bg-black/80 aspect-video">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
            <div className="mt-3 grid gap-2">
              <label className="text-sm">Display name</label>
              <input
                className="h-9 rounded-md border bg-background px-3"
                placeholder={`Guest-${userId.slice(-4)}`}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={joined}
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 grid gap-2">
            <div className="text-sm">
              Status: <span className="font-mono text-muted-foreground">{status}</span>
            </div>
            <div className="flex gap-2">
              {!joined ? (
                <button
                  onClick={onStart}
                  disabled={joining || status === "joining"}
                  className="h-10 px-4 rounded-md bg-primary text-primary-foreground"
                >
                  {status === "joining" ? "Starting..." : "Start Call"}
                </button>
              ) : (
                <button onClick={leaveRoom} className="h-10 px-4 rounded-md bg-destructive text-destructive-foreground">
                  Leave
                </button>
              )}
              {joined ? (
                <>
                  <button onClick={toggleMute} className="h-10 px-3 rounded-md border" aria-pressed={muted}>
                    {muted ? "Unmute" : "Mute"}
                  </button>
                  <button onClick={toggleCamera} className="h-10 px-3 rounded-md border" aria-pressed={cameraOff}>
                    {cameraOff ? "Camera On" : "Camera Off"}
                  </button>
                  <button
                    onClick={startScreenShare}
                    className="h-10 px-3 rounded-md border"
                    aria-pressed={screenSharing}
                    disabled={screenSharing}
                  >
                    {screenSharing ? "Sharing..." : "Share Screen"}
                  </button>
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              After "Start Call", your device preview appears and you join the room. Share this room code with a friend
              to connect.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
