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

// Starta servern
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
