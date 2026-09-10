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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
      SELECT
        z.id,
        z.name,
        ST_Y(z.location::geometry) AS lat,
        ST_X(z.location::geometry) AS lng,
        z.owner_id,
        z.points_value,
        z.pph,
        z.last_taken,
        u.username AS owner_name
      FROM zones z
      LEFT JOIN users u ON u.id = z.owner_id
      ORDER BY z.id
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
// Lägg in många zoner över Storstockholm
app.get('/seed-zones', async (req, res) => {
  try {
    // Rensa gamla testzoner
    await pool.query('DELETE FROM zones');

    const zones = [
      // Centrala Stockholm
      { name: 'Gamla Stan', lat: 59.3251, lng: 18.0711 },
      { name: 'Slussen', lat: 59.3197, lng: 18.0720 },
      { name: 'Södermalm Torg', lat: 59.3128, lng: 18.0755 },
      { name: 'Kungsträdgården', lat: 59.3315, lng: 18.0719 },
      { name: 'Centralstationen', lat: 59.3307, lng: 18.0585 },
      { name: 'Hötorget', lat: 59.3345, lng: 18.0635 },
      { name: 'Sergels Torg', lat: 59.3325, lng: 18.0650 },
      { name: 'Medborgarplatsen', lat: 59.3145, lng: 18.0725 },
      { name: 'Mariatorget', lat: 59.3180, lng: 18.0620 },
      { name: 'Hornstull', lat: 59.3155, lng: 18.0330 },

      // Södermalm & omkring
      { name: 'Fatburen', lat: 59.3100, lng: 18.0650 },
      { name: 'Tantolunden', lat: 59.3135, lng: 18.0450 },
      { name: 'Årstabron', lat: 59.3020, lng: 18.0450 },
      { name: 'Liljeholmen', lat: 59.3105, lng: 18.0220 },

      // Kungsholmen
      { name: 'Fridhemsplan', lat: 59.3335, lng: 18.0280 },
      { name: 'Rådhuset', lat: 59.3285, lng: 18.0400 },
      { name: 'Stadshuset', lat: 59.3273, lng: 18.0545 },

      // Östermalm / Djurgården
      { name: 'Östermalmstorg', lat: 59.3365, lng: 18.0780 },
      { name: 'Karlaplan', lat: 59.3380, lng: 18.0900 },
      { name: 'Djurgårdsbron', lat: 59.3280, lng: 18.1000 },
      { name: 'Skansen', lat: 59.3255, lng: 18.1030 },

      // Norrmalm / Vasastan
      { name: 'Odenplan', lat: 59.3430, lng: 18.0500 },
      { name: 'St:Eriksplan', lat: 59.3400, lng: 18.0350 },
      { name: 'Sankt Eriksgatan', lat: 59.3370, lng: 18.0300 },

      // Lite längre ut
      { name: 'Gullmarsplan', lat: 59.2985, lng: 18.0800 },
      { name: 'Globen', lat: 59.2935, lng: 18.0830 },
      { name: 'Hammarby Sjöstad', lat: 59.3020, lng: 18.1050 },
      { name: 'Sickla', lat: 59.3050, lng: 18.1250 },
      { name: 'Nacka Forum', lat: 59.3100, lng: 18.1550 },
      { name: 'Solna Centrum', lat: 59.3600, lng: 17.9980 },
      { name: 'Sundbyberg', lat: 59.3610, lng: 17.9700 },
      { name: 'Alvik', lat: 59.3330, lng: 17.9800 },
      { name: 'Brommaplan', lat: 59.3380, lng: 17.9400 },
      { name: 'Täby Centrum', lat: 59.4440, lng: 18.0680 },
      { name: 'Kista', lat: 59.4030, lng: 17.9440 }
    ];

    for (const zone of zones) {
      await pool.query(
        `INSERT INTO zones (name, location, points_value, pph)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 150, 6)`,
        [zone.name, zone.lng, zone.lat]
      );
    }

    const count = await pool.query('SELECT COUNT(*) FROM zones');
    res.json({ success: true, message: 'Zoner tillagda!', totalZones: count.rows[0].count });
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
    let userResult = await pool.query(
      'SELECT id, total_points FROM users WHERE username = $1',
      [username]
    );

    let userId;
    let userPoints = 0;

    if (userResult.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (username, total_points) VALUES ($1, 0) RETURNING id, total_points',
        [username]
      );
      userId = newUser.rows[0].id;
      userPoints = 0;
    } else {
      userId = userResult.rows[0].id;
      userPoints = userResult.rows[0].total_points;
    }

    const level = Math.floor(userPoints / 1000) + 1;
    // Blocktid i minuter: minst 3 min, ökar med level
    const blockMinutes = Math.max(3, 3 + level);

    const zoneResult = await pool.query(
      `SELECT id, name, owner_id, points_value, last_taken FROM zones WHERE id = $1`,
      [zoneId]
    );

    if (zoneResult.rows.length === 0) {
      return res.status(404).json({ error: 'Zonen finns inte' });
    }

    const zone = zoneResult.rows[0];

    // Blocktidskoll
    if (zone.last_taken) {
      const lastTaken = new Date(zone.last_taken);
      const now = new Date();
      const diffMs = now - lastTaken;
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes < blockMinutes) {
        const remainingSec = Math.ceil((blockMinutes * 60) - (diffMs / 1000));
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        return res.json({
          success: false,
          blocked: true,
          message: `Zonen är blockerad i ${mins} min ${secs} sek`,
          remainingSeconds: remainingSec
        });
      }
    }

    let points = zone.points_value || 150;
    if (!zone.owner_id) points += 50;

    await pool.query(
      `UPDATE zones SET owner_id = $1, last_taken = NOW() WHERE id = $2`,
      [userId, zoneId]
    );

    const updated = await pool.query(
      'UPDATE users SET total_points = total_points + $1 WHERE id = $2 RETURNING total_points',
      [points, userId]
    );

    res.json({
      success: true,
      message: `Du tog över "${zone.name}"! +${points} poäng`,
      pointsEarned: points,
      totalPoints: updated.rows[0].total_points,
      userId,
      level,
      blockMinutes
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
