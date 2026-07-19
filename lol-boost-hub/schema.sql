CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS encargos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  friend_id INTEGER NOT NULL REFERENCES friends(id),
  oferta TEXT,
  ingreso REAL NOT NULL,
  descuento REAL NOT NULL,
  total REAL NOT NULL,
  notas TEXT,
  fecha TEXT,
  estado TEXT NOT NULL DEFAULT 'en_curso',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encargo_id INTEGER NOT NULL REFERENCES encargos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('antes','despues')),
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO friends (name) VALUES
  ('Trolo'), ('Abramn12'), ('Rafapene'), ('Kin'), ('7th'), ('Chubby')
ON CONFLICT(name) DO NOTHING;
