import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fixa standardikoner i Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const API_URL = 'https://t-clone-api.onrender.com'  // <-- Byt ut denna!

function App() {
  const [zones, setZones] = useState([])

  useEffect(() => {
    fetch(`${API_URL}/zones`)
      .then(res => res.json())
      .then(data => setZones(data))
      .catch(err => console.error(err))
  }, [])

  return (
    <div style={{ height: '100vh', width: '100%' }}>
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
              PPH: {zone.pph}<br />
              ID: {zone.id}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export default App
