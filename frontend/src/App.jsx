import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = 'https://t-clone-api.onrender.com'

function App() {
  const [zones, setZones] = useState([])
  const [status, setStatus] = useState('Laddar zoner...')
  const [playerPos, setPlayerPos] = useState(null)
  const [username, setUsername] = useState('TestSpelare')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPlayerPos([pos.coords.latitude, pos.coords.longitude])
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

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

  const takeZone = (zoneId) => {
    setMessage('Tar över zon...')
    fetch(
      `${API_URL}/takeover-test/${zoneId}?username=${encodeURIComponent(username)}`
    )
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.message || 'Något gick fel')
        if (data.success) fetchZones()
      })
      .catch(() => setMessage('Fel vid takeover'))
  }

  const getZoneColor = (zone) => {
    if (!zone.owner_id) return 'gold'
    return 'red'
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
        <div>{status}</div>
        {message && (
          <div style={{ marginTop: 8, color: '#0066cc' }}>{message}</div>
        )}
      </div>

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
                onClick={() => takeZone(zone.id)}
                style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
              >
                Ta över
              </button>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
