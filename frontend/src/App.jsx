import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = 'https://t-clone-api.onrender.com'
const TAKEOVER_SECONDS = 15

function App() {
  const [zones, setZones] = useState([])
  const [status, setStatus] = useState('Laddar zoner...')
  const [playerPos, setPlayerPos] = useState(null)
  const [gpsEnabled, setGpsEnabled] = useState(true)
  const [username, setUsername] = useState('TestSpelare')
  const [message, setMessage] = useState('')
  const [takingZoneId, setTakingZoneId] = useState(null)
  const [progress, setProgress] = useState(0)

  const watchIdRef = useRef(null)
  const progressIntervalRef = useRef(null)

  // Röst (kvinnlig om tillgänglig)
  const speak = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1
    const voices = window.speechSynthesis.getVoices()
    const female = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('zira') ||
          v.name.toLowerCase().includes('google uk english female'))
    )
    if (female) utterance.voice = female
    window.speechSynthesis.speak(utterance)
  }

  // GPS on/off
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('GPS stöds inte')
      return
    }

    if (gpsEnabled) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setPlayerPos([pos.coords.latitude, pos.coords.longitude])
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      )
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setPlayerPos(null)
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [gpsEnabled])

  const fetchZones = () => {
    fetch(`${API_URL}/zones`)
      .then((res) => res.json())
      .then((data) => {
        setZones(data)
        setStatus(`Hittade ${data.length} zoner`)
      })
      .catch(() => setStatus('Kunde inte hämta zoner'))
  }

  useEffect(() => {
    fetchZones()
  }, [])

  // Starta zontagning (15 sek)
  const startTakeover = (zoneId) => {
    if (takingZoneId) return

    setTakingZoneId(zoneId)
    setProgress(0)
    setMessage('Tar över zon...')
    speak('Taking zone')

    const start = Date.now()
    progressIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      const pct = Math.min(100, (elapsed / TAKEOVER_SECONDS) * 100)
      setProgress(pct)

      if (elapsed >= TAKEOVER_SECONDS) {
        clearInterval(progressIntervalRef.current)
        finishTakeover(zoneId)
      }
    }, 100)
  }

  const finishTakeover = (zoneId) => {
    fetch(
      `${API_URL}/takeover-test/${zoneId}?username=${encodeURIComponent(username)}`
    )
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.message || 'Något gick fel')
        if (data.success) {
          speak('Zone taken')
          fetchZones()
        }
      })
      .catch(() => setMessage('Fel vid takeover'))
      .finally(() => {
        setTakingZoneId(null)
        setProgress(0)
      })
  }

  const cancelTakeover = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    setTakingZoneId(null)
    setProgress(0)
    setMessage('Zontagning avbruten')
  }

  const getZoneColor = (zone) => {
    if (!zone.owner_id) return 'gold'
    return 'red'
  }

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      {/* Kontrollpanel */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1000,
          background: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          maxWidth: '280px',
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <strong>Spelare:</strong>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ marginLeft: 8, padding: 4, width: '140px' }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setGpsEnabled((v) => !v)}
            style={{ padding: '6px 12px', cursor: 'pointer' }}
          >
            GPS: {gpsEnabled ? 'På' : 'Av'}
          </button>
        </div>

        <div>{status}</div>
        {message && (
          <div style={{ marginTop: 8, color: '#0066cc' }}>{message}</div>
        )}
      </div>

      {/* Progress-mätare till vänster */}
      {takingZoneId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 12,
            transform: 'translateY(-50%)',
            zIndex: 1000,
            background: 'white',
            padding: '16px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            textAlign: 'center',
            width: 70,
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 8 }}>Tar över</div>
          <div
            style={{
              width: 40,
              height: 160,
              background: '#eee',
              borderRadius: 8,
              margin: '0 auto',
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
                transition: 'height 0.1s linear',
              }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 'bold' }}>
            {Math.ceil(TAKEOVER_SECONDS - (progress / 100) * TAKEOVER_SECONDS)}s
          </div>
          <button
            onClick={cancelTakeover}
            style={{ marginTop: 10, padding: '4px 8px', fontSize: 12 }}
          >
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
              {zone.owner_id
                ? `Ägare-id: ${zone.owner_id}`
                : 'Neutral zon (+50 bonus)'}
              <br />
              Poäng: {zone.points_value}
              <br />
              <button
                onClick={() => startTakeover(zone.id)}
                disabled={!!takingZoneId}
                style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
              >
                {takingZoneId === zone.id ? 'Tar över...' : 'Ta över'}
              </button>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
