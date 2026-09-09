import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fixa Leaflet-ikoner
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Byt ut till din riktiga backend-adress!
const API_URL = 'https://DIN-RIKTIGA-BACKEND.onrender.com'

function App() {
  const [zones, setZones] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_URL}/zones`)
      .then(res => {
        if (!res.ok) throw new Error('Kunde inte hämta zoner')
        return res.json()
      })
      .then(data => setZones(data))
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
      {error && (
        <div style={{ 
          position: 'absolute', 
          top: 10, 
          left: 10, 
          zIndex: 1000, 
          background: 'white', 
          padding: '10px',
          borderRadius: '5px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        }}>
          Fel: {error}
        </div>
      )}

      <MapContainer 
        center={[59.33, 18.07]} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {zones.map(zone => (
          <Marker key={zone.id} position={[zone.lat, zone.lng]}>
            <Popup>
              <strong>{zone.name}</strong><br />
              Poäng: {zone.points_value}<br />
              ID: {zone.id}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
