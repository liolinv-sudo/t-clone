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

const API_URL = 'https://t-clone-api.onrender.com/' // <-- Byt till din backend-adress!

function App() {
  const [zones, setZones] = useState([])
  const [status, setStatus] = useState('Laddar zoner...')

  useEffect(() => {
    fetch(`${API_URL}/zones`)
      .then(res => res.json())
      .then(data => {
        setZones(data)
        setStatus(`Hittade ${data.length} zoner`)
      })
      .catch(err => {
        setStatus('Kunde inte hämta zoner: ' + err.message)
      })
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1000,
        background: 'white',
        padding: '10px 14px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '14px'
      }}>
        {status}
      </div>

      <MapContainer 
        center={[59.33, 18.07]} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
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
