import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

// Anslut till databasen
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// ===== GRUNDLÄGGANDE ROUTES =====

// Testa att API:et lever
app.get('/', (req, res) => {
  res.json({ message: 'Turf Clone API is running' });
});

// Testa databasanslutningen
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      success: true, 
      time: result.rows[0].now,
      message: 'Databasanslutning fungerar!' 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hämta alla zoner
app.get('/zones', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, 
             ST_Y(location::geometry) as lat, 
             ST_X(location::geometry) as lng,
             owner_id, points_value, pph
      FROM zones
      ORDER BY id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Skapa en ny zon (för test)
app.post('/zones', async (req, res) => {
  const { name, lat, lng, points_value = 100, pph = 5 } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO zones (name, location, points_value, pph)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5)
       RETURNING id, name`,
      [name, lng, lat, points_value, pph]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== TEMPORÄR ROUTE FÖR ATT SKAPA TABELLER =====
// (Lägg den här – före app.listen)
app.get('/init-db', async (req, res) => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT,
        total_points INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location GEOGRAPHY(POINT, 4326) NOT NULL,
        owner_id INTEGER REFERENCES users(id),
        points_value INTEGER DEFAULT 100,
        pph INTEGER DEFAULT 5,
        last_taken TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS zones_location_idx ON zones USING GIST (location);
    `);

    res.json({ success: true, message: 'Tabeller skapade / uppdaterade!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// Temporär route för att lägga in testzoner
app.get('/seed-zones', async (req, res) => {
  try {
    const zones = [
      { name: 'Gamla Stan', lat: 59.3251, lng: 18.0711 },
      { name: 'Slussen', lat: 59.3197, lng: 18.0720 },
      { name: 'Södermalm Torg', lat: 59.3128, lng: 18.0755 },
      { name: 'Kungsträdgården', lat: 59.3315, lng: 18.0719 },
      { name: 'Centralstationen', lat: 59.3307, lng: 18.0585 }
    ];

    for (const zone of zones) {
      await pool.query(
        `INSERT INTO zones (name, location, points_value, pph)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), 150, 6)
         ON CONFLICT DO NOTHING`,
        [zone.name, zone.lng, zone.lat]
      );
    }

    res.json({ success: true, message: 'Testzoner tillagda!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Starta servern (denna ska alltid vara sist)
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
