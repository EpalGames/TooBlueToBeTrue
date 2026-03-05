import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';

const db = new Database('leaderboard.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/leaderboard', (req, res) => {
    try {
      const stmt = db.prepare('SELECT name, score, date FROM scores ORDER BY score DESC LIMIT 10');
      const scores = stmt.all();
      res.json(scores);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/leaderboard', (req, res) => {
    try {
      const { name, score } = req.body;
      if (!name || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid input' });
      }
      const stmt = db.prepare(`
        INSERT INTO scores (name, score, date) 
        VALUES (?, ?, ?) 
        ON CONFLICT(name) DO UPDATE SET 
          score = excluded.score, 
          date = excluded.date 
        WHERE excluded.score > scores.score
      `);
      stmt.run(name.substring(0, 20), score, new Date().toISOString());
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving score:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
