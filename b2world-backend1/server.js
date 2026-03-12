require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db'); // ✅ FIXED PATH

/**
 * Server Entry Point
 * Starts the Express server and connects to MongoDB
 */

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`
╔══════════════════════════════════════════════╗
║   🚀 B2World ATS Backend Server Starting    ║
║   📍 Port: ${PORT.toString().padEnd(33)}║
║   🌍 Environment: ${NODE_ENV.padEnd(26)}║
║   🔒 Password validation: ${NODE_ENV === 'development' ? 'LENIENT (4+ chars)' : 'STRICT (6+ chars, mixed case, number)'}  ║
║   📅 Started: ${new Date().toLocaleString().padEnd(29)}║
╚══════════════════════════════════════════════╝
`);

// ✅ Connect to MongoDB BEFORE starting server
connectDB();

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});

// Handle server listen errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    process.exit(1);
  }
  throw err;
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    const mongoose = require('mongoose');
    mongoose.connection.close().then(() => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    }).catch((err) => {
      console.error('❌ MongoDB connection close error:', err);
      process.exit(1);
    });
  });

  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;
