import { useEffect, useState, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'
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

function MapController({ flyTarget, resetNorth }) {
  const map = useMap()
  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 16, { duration: 1.2 })
    }
  }, [flyTarget, map])
  useEffect(() => {
    if (resetNorth) {
      map.setView(map.getCenter(), map.getZoom())
    }
  }, [resetNorth, map])
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
  const [northTick, setNorthTick] = useState(0)
  const [profile, setProfile] = useState(null)
  const [showProfile, setShowProfile] = useState(false)

  const watchIdRef = useRef(null)
  const progressRef = useRef(null)

  const speak = (text) => {
    if (!audioEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    u.volume = 1
    const voices = window.speechSynthesis.getVoices()
    const female = voices.find((v) =>
      /female|samantha|zira|victoria|karen/i.test(v.name)
    )
    if (female) u.voice = female
    window.speechSynthesis.speak(u)
  }

  const enableAudio = () => {
    if (!window.speechSynthesis) {
      setMessage('Röst stöds inte här')
      return
    }
    const u = new SpeechSynthesisUtterance('Audio on')
    window.speechSynthesis.speak(u)
    setAudioEnabled(true)
    setMessage('Ljud på')
  }

  const toggleAudio = () => {
    if (audioEnabled) {
      window.speechSynthesis?.cancel()
      setAudioEnabled(false)
      setMessage('Ljud av')
    } else {
      enableAudio()
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

  const fetchZones = () => {
    fetch(`${API_URL}/zones`)
      .then((r) => r.json())
      .then((data) => {
        setZones(data)
        setStatus(`${data.length} zoner`)
        updateBlockInfo(data)
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

  // Nytt spelarnamn → nollställ sessionräknare
  useEffect(() => {
    setZonesTakenCount(0)
    setMyUserId(null)
    setMyZones([])
    setTotalPoints(0)
    fetchPlayer(username)
  }, [username])

  const canTake = () => gpsEnabled === true && playerPos !== null

  const getSeconds = () => {
    // Första zonen denna session: 15 s. Därefter 10 s bara om GPS+position.
    if (zonesTakenCount === 0) return BASE_SECONDS
    if (canTake()) return GPS_SECONDS
    return BASE_SECONDS
  }

  const startTakeover = (zoneId) => {
    if (takingZoneId) return

    if (!canTake()) {
      setMessage('GPS måste vara PÅ och position OK för att ta zon')
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
      // Om GPS stängs av under tagning → avbryt
      if (!gpsEnabled || !playerPos) {
        clearInterval(progressRef.current)
        setTakingZoneId(null)
        setProgress(0)
        setMessage('Zontagning avbruten – GPS krävs')
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
    if (!gpsEnabled || !playerPos) {
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
          // Sätt block direkt lokalt
          setBlockInfo((prev) => ({
            ...prev,
            [zoneId]: BLOCK_MINUTES * 60,
          }))
          fetchZones()
          fetchPlayer()
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

  const getZoneColor = (zone) => {
    if (!zone.owner_id) return 'gold'
    if (myUserId && zone.owner_id === myUserId) return 'lime'
    return 'red'
  }

  const doSearch = () => {
    const q = search.trim().toLowerCase()
    if (!q) return

    // Zonsök
    const zone = zones.find((z) => z.name.toLowerCase().includes(q))
    if (zone) {
      setFlyTarget([zone.lat, zone.lng])
      setShowProfile(false)
      setMessage(`Visar zon: ${zone.name}`)
      return
    }

    // Spelarsök
    fetch(`${API_URL}/player/${encodeURIComponent(search.trim())}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.exists) {
          setProfile(data)
          setShowProfile(true)
          setMessage(`Profil: ${data.username}`)
        } else {
          setMessage('Hittade varken zon eller spelare')
          setShowProfile(false)
        }
      })
      .catch(() => setMessage('Sökfel'))
  }

  const goNorth = () => {
    if (playerPos) setFlyTarget([...playerPos])
    setNorthTick((n) => n + 1)
    setMessage('Norr upp / centrerad på dig')
  }

  const total = getSeconds()
  const left = Math.ceil(total - (progress / 100) * total)

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      {/* Panel */}
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
          {myZones.length > 0 && (
            <div style={{ fontSize: 12 }}>
              {myZones.map((z) => z.name).join(', ')}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setGpsEnabled((v) => !v)}>
            GPS: {gpsEnabled ? 'På' : 'Av'}
          </button>
          <button onClick={toggleAudio}>
            Ljud: {audioEnabled ? 'På' : 'Av'}
          </button>
        </div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          {playerPos ? 'Position OK' : 'Ingen position'}
          {' · '}
          Taketid: {getSeconds()} s
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

      {/* Kompass */}
      <button
        onClick={goNorth}
        title="Norr upp / centrera på mig"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '2px solid #333',
          background: 'white',
          fontWeight: 'bold',
          fontSize: 18,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'crimson' }}>N</span>
      </button>

      {/* Spelarprofil */}
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
            <strong>Zoner ({profile.zones?.length || 0}):</strong>
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
              {(profile.zones || []).map((z) => (
                <li key={z.id}>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#06c',
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                    }}
                    onClick={() => {
                      const found = zones.find((x) => x.id === z.id)
                      if (found) {
                        setFlyTarget([found.lat, found.lng])
                        setShowProfile(false)
                      }
                    }}
                  >
                    {z.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Progress */}
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

      <MapContainer
        center={playerPos || [59.33, 18.07]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <MapController flyTarget={flyTarget} resetNorth={northTick} />

        {playerPos && (
          <CircleMarker
            center={playerPos}
            radius={9}
            pathOptions={{
              color: 'blue',
              fillColor: '#2196F3',
              fillOpacity: 0.9,
            }}
          />
        )}

        {zones.map((zone) => (
          <CircleMarker
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={14}
            pathOptions={{
              color: getZoneColor(zone),
              fillColor: getZoneColor(zone),
              fillOpacity: 0.75,
            }}
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
                  cursor:
                    !canTake() || blockInfo[zone.id] > 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {!canTake()
                  ? 'Kräver GPS'
                  : blockInfo[zone.id] > 0
                  ? 'Blockerad'
                  : takingZoneId === zone.id
                  ? 'Tar över...'
                  : 'Ta över'}
              </button>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
