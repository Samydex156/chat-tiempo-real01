const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Cambiar en producción
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // SSL solo en producción
});

// Crear tabla de mensajes si no existe
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
})();

// Endpoint básico
app.get('/api', (req, res) => {
  res.send('Servidor de chat en tiempo real');
});

// Manejo de conexiones Socket.IO
io.on('connection', async (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Enviar historial de mensajes al nuevo usuario
  const { rows } = await pool.query('SELECT username, text, created_at FROM messages ORDER BY created_at');
  socket.emit('loadMessages', rows);

  // Escuchar mensajes del cliente
  socket.on('sendMessage', async (message) => {
    const { username, text } = message;
    // Guardar en la base de datos
    await pool.query(
      'INSERT INTO messages (username, text) VALUES ($1, $2)',
      [username, text]
    );
    // Emitir a todos los clientes
    io.emit('receiveMessage', { username, text, created_at: new Date() });
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

// Puerto dinámico
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});