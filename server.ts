import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // TMDB Proxy Routes
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";

  app.get("/api/movies/search", async (req, res) => {
    const { query } = req.query;
    if (!TMDB_API_KEY) return res.status(500).json({ error: "TMDB_API_KEY not set" });
    
    try {
      const response = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(String(query))}&language=sw-TZ&include_adult=false`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch from TMDB" });
    }
  });

  app.get("/api/movies/trending", async (req, res) => {
    if (!TMDB_API_KEY) return res.status(500).json({ error: "TMDB_API_KEY not set" });
    
    try {
      const response = await fetch(`${TMDB_BASE_URL}/trending/movie/day?api_key=${TMDB_API_KEY}&language=sw-TZ`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch from TMDB" });
    }
  });

  app.get("/api/movies/details/:id", async (req, res) => {
    const { id } = req.params;
    if (!TMDB_API_KEY) return res.status(500).json({ error: "TMDB_API_KEY not set" });
    
    try {
      const response = await fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&language=sw-TZ&append_to_response=credits,videos`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch from TMDB" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
