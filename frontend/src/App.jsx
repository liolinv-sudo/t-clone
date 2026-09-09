import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fixa standardikoner
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const API_URL = 'https://t-clone-api.onrender.com'

function App() {
  const [zones, setZones] = useState([])
  const [status, setStatus] = useState('Laddar zoner...')
  const [playerPos, setPlayerPos] = useState(null)
  const [username, setUsername] = useState('TestSpelare')
  const [message, setMessage] = useState('')

  // Hämta spelarens GPS-position
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('GPS stöds inte i denna webbläsare')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPlayerPos([pos.coords.latitude, pos.coords.longitude])
      },
      (err) => {
        console.error(err)
        setStatus('Kunde inte hämta GPS-position')
      },
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Hämta zoner
  const fetchZones = () => {
    fetch(`${API_URL}/zones`)
      .then(res => res.json())
      .then(data => {
        setZones(data)
        setStatus(`Hittade ${data.length} zoner`)
      })
      .catch(err => {
        setStatus('Kunde inte hämta zoner')
        console.error(err)
      })
  }

  useEffect(() => {
    fetchZones()
  }, [])

  // Ta över zon
  const takeZone = (zoneId) => {
    setMessage('Tar över zon...')
    fetch(`${API_URL}/takeover-test/${zoneId}?username=${username}`)
      .then(res => res.json())
      .then(data => {
        setMessage(data.message || 'Något gick fel')
        fetchZones() // uppdatera kartan
      })
      .catch(err => {
        setMessage('Fel vid takeover')
        console.error(err)
      })
  }

  // Bestäm färg på zonen
  const getZoneColor = (zone) => {
    if (!zone.owner_id) return 'yellow'          // Neutral
    if (zone.owner_id === 3) return 'lime'       // Din zon (hårdkodat för test)
    return 'red'                                 // Andras zon
  }

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      
      {/* Status + meddelande */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1000,
        background: 'white',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        maxWidth: '280px'
      }}>
        <div style={{ marginBottom: 8 }}>
          <strong>Spelare:</strong> 
          <input 
            value={username} 
            onChange={e => setUsername(e.target.value)}
            style={{ marginLeft: 8, padding: 4 }}
          />
        </div>
        <div>{status}</div>
        {message && <div style={{ marginTop: 8, color: '#0066cc' }}>{message}</div>}
      </div>

      <MapContainer 
        center={playerPos || [59.33, 18.07]} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
