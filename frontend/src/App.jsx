import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = 'https://t-clone-api.onrender.com'
const BASE_SECONDS = 15
const GPS_SECONDS = 10

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m} min ${r} sek`
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

  const watchIdRef = useRef(null)
  const progressRef = useRef(null)

  // Aktivera ljud (kräver klick)
  const enableAudio = () => {
    if (!window.speechSynthesis) {
      setMessage('Röst stöds inte i denna webbläsare')
      return
    }
    const u = new SpeechSynthesisUtterance('Audio on')
    u.volume = 1
    u.rate = 1
    window.speechSynthesis.speak(u)
    setAudioEnabled(true)
    setMessage('Ljud aktiverat')
  }

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

  // GPS – startar bara när användaren sätter på
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

  const fetchZones = () => {
    fetch(`${API_URL}/zones`)
      .then((r) => r.json())
      .then((data) => {
        setZones(data)
        setStatus(`${data.length} zoner`)
        // Räkna ut blocktid per zon (minst 3 min)
        const info = {}
        const now = Date.now()
        data.forEach((z) => {
          if (z.last_taken) {
            const blockMin = 3
            const end = new Date(z.last_taken).getTime() + blockMin * 60 * 1000
            const left = Math.ceil((end - now) / 1000)
            if (left > 0) info[z.id] = left
          }
        })
        setBlockInfo(info)
      })
      .catch(() => setStatus('Kunde inte hämta zoner'))
  }

  const fetchPlayer = () => {
    fetch(`${API_URL}/player/${encodeURIComponent(username)}`)
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

  useEffect(() => {
    fetchPlayer()
  }, [username])

  const canTake = () => gpsEnabled && playerPos !== null

  const getSeconds = () => {
    if (zonesTakenCount === 0) return BASE_SECONDS
    return canTake() ? GPS_SECONDS : BASE_SECONDS
  }

  const startTakeover = (zoneId) => {
    if (takingZoneId) return
    if (!canTake()) {
      setMessage('Slå på GPS och vänta på position innan du tar zoner')
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
      const elapsed = (Date.now() - start) / 1000
      setProgress(Math.min(100, (elapsed / total) * 100))
      if (elapsed >= total) {
        clearInterval(progressRef.current)
        finishTakeover(zoneId)
      }
    }, 100)
  }

  const finishTakeover = (zoneId) => {
    fetch(
      `${API_URL}/takeover-test/${zoneId}?username=${encodeURIComponent(username)}`
    )
      .then((r) => r.json())
      .then((data) => {
        setMessage(data.message || 'Fel')
        if (data.success) {
          speak('Zone taken')
          setZonesTakenCount((c) => c + 1)
          if (data.totalPoints != null) setTotalPoints(data.totalPoints)
          if (data.userId) setMyUserId(data.userId)
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

  const total = getSeconds()
  const left = Math.ceil(total - (progress / 100) * total)

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
          maxWidth: 320,
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
            <div style={{ fontSize: 12, color: '#333' }}>
              {myZones.map((z) => z.name).join(', ')}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 6 }}>
          <button onClick={() => setGpsEnabled((v) => !v)}>
            GPS: {gpsEnabled ? 'På' : 'Av'}
          </button>{' '}
          <span style={{ fontSize: 12 }}>
            {playerPos ? 'Position OK' : 'Ingen position'}
          </span>
        </div>
        <div style={{ marginBottom: 6 }}>
          <button onClick={enableAudio}>
            Ljud: {audioEnabled ? 'På' : 'Aktivera ljud'}
          </button>
        </div>
        <div>{status}</div>
        {message && (
          <div style={{ marginTop: 6, color: '#06c' }}>{message}</div>
        )}
      </div>

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
        {playerPos && (
          <CircleMarker
            center={playerPos}
            radius={9}
            pathOptions={{ color: 'blue', fillColor: '#2196F3', fillOpacity: 0.9 }}
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
                  !!takingZoneId ||
                  !canTake() ||
                  (blockInfo[zone.id] > 0)
                }
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  opacity:
                    !canTake() || blockInfo[zone.id] > 0 ? 0.5 : 1,
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
