import { useEffect, useState, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = 'https://t-clone-api.onrender.com'
const BASE_SECONDS = 15
const GPS_SECONDS = 10
const BLOCK_MINUTES = 5

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m} min ${r} sek`
}

function makePersonIcon(color) {
  const bg = color === 'green' ? '#22c55e' : '#ef4444'
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${bg};border:2px solid #111;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;box-shadow:0 1px 4px rgba(0,0,0,.4);
    ">👤</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function makeZoneIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${color};border:2px solid #333;
      opacity:0.9;box-shadow:0 1px 3px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function MapController({ flyTarget }) {
  const map = useMap()
  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 16, { duration: 1.0 })
    }
  }, [flyTarget, map])
  return null
}

function App() {
  const [zones, setZones] = useState([])
  const [status, setStatus] = useState('Laddar...')
  const [playerPos, setPlayerPos] = useState(null)
  const [gpsEnabled, setGpsEnabled] = useState(false)
  const [username, setUsername] = useState('TestSpelare')
  const [message, setMessage] = useState('')
  const [takingZoneId, setTakingZoneId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [zonesTakenCount, setZonesTakenCount] = useState(0)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [totalPoints, setTotalPoints] = useState(0)
  const [myZones, setMyZones] = useState([])
  const [myUserId, setMyUserId] = useState(null)
  const [blockInfo, setBlockInfo] = useState({})
  const [search, setSearch] = useState('')
  const [flyTarget, setFlyTarget] = useState(null)
  const [profile, setProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [tab, setTab] = useState(null) // 'leaderboard' | 'medals' | null
  const [leaderboard, setLeaderboard] = useState([])
  const [medals, setMedals] = useState([])
  const [otherPlayers, setOtherPlayers] = useState([])

  const watchIdRef = useRef(null)
  const progressRef = useRef(null)
  const gpsEnabledRef = useRef(false)
  const playerPosRef = useRef(null)

  useEffect(() => {
    gpsEnabledRef.current = gpsEnabled
  }, [gpsEnabled])
  useEffect(() => {
    playerPosRef.current = playerPos
  }, [playerPos])

  const speak = (text) => {
    if (!audioEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    const voices = window.speechSynthesis.getVoices()
    const female = voices.find((v) =>
      /female|samantha|zira|victoria|karen/i.test(v.name)
    )
    if (female) u.voice = female
    window.speechSynthesis.speak(u)
  }

  const toggleAudio = () => {
    if (audioEnabled) {
      window.speechSynthesis?.cancel()
      setAudioEnabled(false)
      setMessage('Ljud av')
    } else if (window.speechSynthesis) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('Audio on'))
      setAudioEnabled(true)
      setMessage('Ljud på')
    }
  }

  // GPS
  useEffect(() => {
    if (!gpsEnabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setPlayerPos(null)
      setZonesTakenCount(0) // återställ taketid till 15 s
      return
    }
    if (!navigator.geolocation) {
      setMessage('GPS stöds inte')
      setGpsEnabled(false)
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setPlayerPos([pos.coords.latitude, pos.coords.longitude]),
      () => setMessage('Tillåt plats i webbläsaren'),
      { enableHighAccuracy: true }
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [gpsEnabled])

  const updateBlockInfo = (data) => {
    const info = {}
    const now = Date.now()
    data.forEach((z) => {
      if (z.last_taken) {
        const end =
          new Date(z.last_taken).getTime() + BLOCK_MINUTES * 60 * 1000
        const left = Math.ceil((end - now) / 1000)
        if (left > 0) info[z.id] = left
      }
    })
    setBlockInfo(info)
  }

  // Andra spelare = en markör per ägare (vid en av deras zoner)
  const buildOtherPlayers = (data, meId) => {
    const byOwner = {}
    data.forEach((z) => {
      if (!z.owner_id || z.owner_id === meId) return
      if (!byOwner[z.owner_id]) {
        byOwner[z.owner_id] = {
          id: z.owner_id,
          name: z.owner_name || `Spelare ${z.owner_id}`,
          lat: z.lat,
          lng: z.lng,
        }
      }
    })
    setOtherPlayers(Object.values(byOwner))
  }

  const fetchZones = () => {
    fetch(`${API_URL}/zones`)
      .then((r) => r.json())
      .then((data) => {
        setZones(data)
        setStatus(`${data.length} zoner`)
        updateBlockInfo(data)
        buildOtherPlayers(data, myUserId)
      })
      .catch(() => setStatus('Kunde inte hämta zoner'))
  }

  const fetchPlayer = (name = username) => {
    fetch(`${API_URL}/player/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.exists) {
          setTotalPoints(data.total_points || 0)
          setMyZones(data.zones || [])
          setMyUserId(data.id)
        } else {
          setTotalPoints(0)
          setMyZones([])
          setMyUserId(null)
        }
      })
      .catch(() => {})
  }

  const fetchLeaderboard = () => {
    fetch(`${API_URL}/leaderboard`)
      .then((r) => r.json())
      .then((data) => setLeaderboard(Array.isArray(data) ? data : []))
      .catch(() => setLeaderboard([]))
  }

  const fetchMedals = (name = username) => {
    fetch(`${API_URL}/medals/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => setMedals(Array.isArray(data) ? data : data.medals || []))
      .catch(() => setMedals([]))
  }

  useEffect(() => {
    fetchZones()
    fetchPlayer()
    const t = setInterval(() => {
      setBlockInfo((prev) => {
        const next = {}
        Object.keys(prev).forEach((id) => {
          const v = prev[id] - 1
          if (v > 0) next[id] = v
        })
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setZonesTakenCount(0)
    setMyUserId(null)
    setMyZones([])
    setTotalPoints(0)
    fetchPlayer(username)
  }, [username])

  useEffect(() => {
    if (zones.length) buildOtherPlayers(zones, myUserId)
  }, [myUserId, zones])

  const canTake = () =>
    gpsEnabledRef.current === true && playerPosRef.current !== null

  const getSeconds = () => {
    if (zonesTakenCount === 0) return BASE_SECONDS
    if (canTake()) return GPS_SECONDS
    return BASE_SECONDS
  }

  const startTakeover = (zoneId) => {
    if (takingZoneId) return
    if (!canTake()) {
      setMessage('GPS måste vara PÅ och position OK')
      return
    }
    if (blockInfo[zoneId] > 0) {
      setMessage(`Blockerad: ${formatTime(blockInfo[zoneId])}`)
      return
    }

    const total = getSeconds()
    setTakingZoneId(zoneId)
    setProgress(0)
    setMessage(`Tar över (${total} s)...`)
    speak('Taking zone')

    const start = Date.now()
    progressRef.current = setInterval(() => {
      if (!gpsEnabledRef.current || !playerPosRef.current) {
        clearInterval(progressRef.current)
        setTakingZoneId(null)
        setProgress(0)
        setMessage('Avbruten – GPS stängdes av')
        return
      }
      const elapsed = (Date.now() - start) / 1000
      setProgress(Math.min(100, (elapsed / total) * 100))
      if (elapsed >= total) {
        clearInterval(progressRef.current)
        finishTakeover(zoneId)
      }
    }, 100)
  }

  const finishTakeover = (zoneId) => {
    if (!gpsEnabledRef.current || !playerPosRef.current) {
      setMessage('GPS krävs – tagning avbruten')
      setTakingZoneId(null)
      setProgress(0)
      return
    }

    fetch(
      `${API_URL}/takeover-test/${zoneId}?username=${encodeURIComponent(
        username
      )}`
    )
      .then((r) => r.json())
      .then((data) => {
        setMessage(data.message || 'Fel')
        if (data.blocked && data.remainingSeconds) {
          setBlockInfo((prev) => ({
            ...prev,
            [zoneId]: data.remainingSeconds,
          }))
        }
        if (data.success) {
          speak('Zone taken')
          setZonesTakenCount((c) => c + 1)
          if (data.totalPoints != null) setTotalPoints(data.totalPoints)
          if (data.userId) setMyUserId(data.userId)
          setBlockInfo((prev) => ({
            ...prev,
            [zoneId]: BLOCK_MINUTES * 60,
          }))
          fetchZones()
          fetchPlayer()
          fetchMedals()
        }
      })
      .catch(() => setMessage('Nätverksfel'))
      .finally(() => {
        setTakingZoneId(null)
        setProgress(0)
      })
  }

  const cancelTakeover = () => {
    if (progressRef.current) clearInterval(progressRef.current)
    setTakingZoneId(null)
    setProgress(0)
    setMessage('Avbruten')
  }

  const zoneColor = (zone) => {
    if (!zone.owner_id) return 'gold'
    if (myUserId && zone.owner_id === myUserId) return 'lime'
    return '#ef4444'
  }

  const doSearch = () => {
    const q = search.trim().toLowerCase()
    if (!q) return

    const zone = zones.find((z) =>
      (z.name || '').toLowerCase().includes(q)
    )
    if (zone) {
      setFlyTarget([Number(zone.lat), Number(zone.lng)])
      setShowProfile(false)
      setTab(null)
      setMessage(`Zon: ${zone.name}`)
      return
    }

    fetch(`${API_URL}/player/${encodeURIComponent(search.trim())}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.exists) {
          setProfile(data)
          setShowProfile(true)
          setTab(null)
          setMessage(`Profil: ${data.username}`)
          // Om spelaren äger en zon – flytta kartan dit
          if (data.zones?.length) {
            const z = zones.find((x) => x.id === data.zones[0].id)
            if (z) setFlyTarget([Number(z.lat), Number(z.lng)])
          }
        } else {
          setMessage('Hittade varken zon eller spelare')
        }
      })
      .catch(() => setMessage('Sökfel'))
  }

  const openLeaderboard = () => {
    setTab('leaderboard')
    setShowProfile(false)
    fetchLeaderboard()
  }

  const openMedals = () => {
    setTab('medals')
    setShowProfile(false)
    fetchMedals()
  }

  const total = getSeconds()
  const left = Math.ceil(total - (progress / 100) * total)

  const MEDAL_INFO = {
    first_take: { name: 'Första tagningen', icon: '🥇' },
    zones_5: { name: '5 zoner', icon: '🥉' },
    zones_10: { name: '10 zoner', icon: '🥈' },
    points_500: { name: '500 poäng', icon: '⭐' },
    points_1000: { name: '1000 poäng', icon: '🌟' },
  }

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1000,
          background: 'white',
          padding: 12,
          borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          maxWidth: 340,
          fontSize: 14,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <strong>Spelare:</strong>{' '}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: 4, width: 130 }}
          />
        </div>
        <div>
          <strong>Poäng:</strong> {totalPoints}
        </div>
        <div style={{ marginBottom: 6 }}>
          <strong>Egna zoner:</strong> {myZones.length}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <button
            onClick={() => setGpsEnabled((v) => !v)}
          >
            GPS: {gpsEnabled ? 'På' : 'Av'}
          </button>
          <button onClick={toggleAudio}>
            Ljud: {audioEnabled ? 'På' : 'Av'}
          </button>
          <button onClick={openLeaderboard}>Tabell</button>
          <button onClick={openMedals}>Medaljer</button>
        </div>

        <div style={{ fontSize: 12, marginBottom: 6 }}>
          {playerPos ? 'Position OK' : 'Ingen position'} · Taketid:{' '}
          {getSeconds()} s
        </div>

        <div style={{ marginBottom: 6 }}>
          <input
            placeholder="Sök zon eller spelare"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            style={{ padding: 4, width: 180 }}
          />
          <button onClick={doSearch} style={{ marginLeft: 4 }}>
            Sök
          </button>
        </div>

        <div>{status}</div>
        {message && (
          <div style={{ marginTop: 6, color: '#06c' }}>{message}</div>
        )}
      </div>

      {/* Tabell / medaljer */}
      {tab && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            right: 12,
            zIndex: 1000,
            background: 'white',
            padding: 14,
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            width: 260,
            maxHeight: '70vh',
            overflow: 'auto',
            fontSize: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{tab === 'leaderboard' ? 'Topplista' : 'Medaljer'}</strong>
            <button onClick={() => setTab(null)}>×</button>
          </div>
          {tab === 'leaderboard' && (
            <ol style={{ paddingLeft: 20, marginTop: 8 }}>
              {leaderboard.length === 0 && <li>Inga spelare ännu</li>}
              {leaderboard.map((p, i) => (
                <li key={p.username || i}>
                  {p.username} – {p.total_points} p
                </li>
              ))}
            </ol>
          )}
          {tab === 'medals' && (
            <ul style={{ paddingLeft: 18, marginTop: 8 }}>
              {medals.length === 0 && <li>Inga medaljer ännu</li>}
              {medals.map((m, i) => {
                const info = MEDAL_INFO[m.medal_type] || {
                  name: m.medal_type,
                  icon: '🏅',
                }
                return (
                  <li key={i}>
                    {info.icon} {info.name}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {showProfile && profile && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            right: 12,
            zIndex: 1000,
            background: 'white',
            padding: 14,
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            width: 240,
            fontSize: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{profile.username}</strong>
            <button onClick={() => setShowProfile(false)}>×</button>
          </div>
          <div>Poäng: {profile.total_points}</div>
          <div style={{ marginTop: 8 }}>
            Zoner: {(profile.zones || []).map((z) => z.name).join(', ') || '–'}
          </div>
        </div>
      )}

      {takingZoneId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 12,
            transform: 'translateY(-50%)',
            zIndex: 1000,
            background: 'white',
            padding: 12,
            borderRadius: 8,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            textAlign: 'center',
            width: 72,
          }}
        >
          <div style={{ fontSize: 12 }}>Tar över</div>
          <div
            style={{
              width: 40,
              height: 160,
              background: '#eee',
              borderRadius: 8,
              margin: '8px auto',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${progress}%`,
                background: '#4CAF50',
              }}
            />
          </div>
          <div style={{ fontWeight: 'bold' }}>{left}s</div>
          <button onClick={cancelTakeover} style={{ marginTop: 8, fontSize: 12 }}>
            Avbryt
          </button>
        </div>
      )}

      {/* center bara initialt – inte bunden till playerPos */}
      <MapContainer
        center={[59.33, 18.07]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <MapController flyTarget={flyTarget} />

        {playerPos && (
          <Marker position={playerPos} icon={makePersonIcon('green')}>
            <Popup>Du ({username})</Popup>
          </Marker>
        )}

        {otherPlayers.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={makePersonIcon('red')}
          >
            <Popup>{p.name}</Popup>
          </Marker>
        ))}

        {zones.map((zone) => (
          <Marker
            key={zone.id}
            position={[zone.lat, zone.lng]}
            icon={makeZoneIcon(zoneColor(zone))}
          >
            <Popup>
              <strong>{zone.name}</strong>
              <br />
              {zone.owner_name
                ? `Ägare: ${zone.owner_name}`
                : zone.owner_id
                ? `Ägare-id: ${zone.owner_id}`
                : 'Neutral (+50)'}
              <br />
              Poäng: {zone.points_value}
              <br />
              {blockInfo[zone.id] > 0 ? (
                <span style={{ color: 'crimson' }}>
                  Blockerad: {formatTime(blockInfo[zone.id])}
                </span>
              ) : (
                <span style={{ color: 'green' }}>Kan tas</span>
              )}
              <br />
              <button
                onClick={() => startTakeover(zone.id)}
                disabled={
                  !!takingZoneId || !canTake() || blockInfo[zone.id] > 0
                }
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  opacity: !canTake() || blockInfo[zone.id] > 0 ? 0.5 : 1,
                }}
              >
                {!canTake()
                  ? 'Kräver GPS'
                  : blockInfo[zone.id] > 0
                  ? 'Blockerad'
                  : 'Ta över'}
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
