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
// Temporär route för att lägga in testzoner
app.get('/seed-zones', async (req, res) => {
  try {
    // Rensa gamla testzoner först (valfritt)
    await pool.query(`DELETE FROM zones WHERE name IN ('Gamla Stan', 'Slussen', 'Södermalm Torg', 'Kungsträdgården', 'Centralstationen')`);

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
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5)`,
        [zone.name, zone.lng, zone.lat, 150, 6]
      );
    }

    const count = await pool.query('SELECT COUNT(*) FROM zones');
    res.json({ 
      success: true, 
      message: 'Testzoner tillagda!', 
      totalZones: count.rows[0].count 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ta över en zon
app.post('/zones/:id/takeover', async (req, res) => {
  const zoneId = req.params.id;
  const { username } = req.body;   // Skicka med {"username": "DittNamn"}

  if (!username) {
    return res.status(400).json({ error: 'Du måste skicka med ett username' });
  }

  try {
    // 1. Hitta eller skapa användaren
    let userResult = await pool.query(
      'SELECT id, total_points FROM users WHERE username = $1',
      [username]
    );

    let userId;
    if (userResult.rows.length === 0) {
      // Skapa ny användare
      const newUser = await pool.query(
        'INSERT INTO users (username, total_points) VALUES ($1, 0) RETURNING id',
        [username]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // 2. Hämta zonen
    const zoneResult = await pool.query(
      'SELECT id, name, owner_id, points_value FROM zones WHERE id = $1',
      [zoneId]
    );

    if (zoneResult.rows.length === 0) {
      return res.status(404).json({ error: 'Zonen finns inte' });
    }

    const zone = zoneResult.rows[0];

    // 3. Uppdatera zonen till den nya ägaren
    await pool.query(
      `UPDATE zones 
       SET owner_id = $1, last_taken = NOW() 
       WHERE id = $2`,
      [userId, zoneId]
    );

    // 4. Ge poäng till spelaren
    const points = zone.points_value || 100;
    await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE id = $2',
      [points, userId]
    );

    res.json({
      success: true,
      message: `Du tog över zonen "${zone.name}"!`,
      pointsEarned: points,
      zoneId: zone.id,
      newOwner: username
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Enkel GET-version för att testa takeover i webbläsaren
app.get('/takeover-test/:id', async (req, res) => {
  const zoneId = req.params.id;
  const username = req.query.username || 'TestSpelare';

  try {
    // 1. Hitta eller skapa användaren
    let userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    let userId;
    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (username, total_points) VALUES ($1, 0) RETURNING id',
        [username]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // 2. Hämta zonen
    const zoneResult = await pool.query(
      'SELECT id, name, points_value FROM zones WHERE id = $1',
      [zoneId]
    );

    if (zoneResult.rows.length === 0) {
      return res.status(404).json({ error: 'Zonen finns inte' });
    }

    const zone = zoneResult.rows[0];

    // 3. Uppdatera zonen
    await pool.query(
      `UPDATE zones SET owner_id = $1, last_taken = NOW() WHERE id = $2`,
      [userId, zoneId]
    );

    // 4. Ge poäng
    const points = zone.points_value || 100;
    await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE id = $2',
      [points, userId]
    );

    res.json({
      success: true,
      message: `Du tog över zonen "${zone.name}"!`,
      pointsEarned: points,
      zoneId: zone.id,
      newOwner: username
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Starta servern (denna ska alltid vara sist)
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
