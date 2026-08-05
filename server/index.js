require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const { validateConfig, shutdownTimeoutMs } = require('./config');
const operations = require('./lib/operations');
const reminderService = require('./services/reminderService');
const PORT = process.env.PORT || 5000;
let server;
let shuttingDown = false;

try { validateConfig(); } catch (error) { console.error(error.message); process.exit(1); }

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true; operations.setReady(false);
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal, timestamp: new Date().toISOString() }));
  reminderService.stopReminderWorker();
  const forceTimer = setTimeout(() => process.exit(1), shutdownTimeoutMs()); forceTimer.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    clearTimeout(forceTimer);
    process.exit(exitCode);
  } catch (error) { console.error('Graceful shutdown failed:', error.message); process.exit(1); }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => { console.error('Unhandled rejection:', error); shutdown('unhandledRejection', 1); });
process.on('uncaughtException', (error) => { console.error('Uncaught exception:', error); shutdown('uncaughtException', 1); });

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    await Promise.all([
      require('./models/User').init(),
      require('./models/Appointment').init(),
      require('./models/RegistrationOtp').init(),
      require('./models/PasswordResetOtp').init(),
      require('./models/QueueState').init(),
      require('./models/Notification').init(),
      require('./models/AuditLog').init(),
      require('./models/AuthSession').init(),
      require('./models/EmailChangeOtp').init(),
      require('./models/MfaChallenge').init(),
      require('./models/MedicalRecord').init(),
      require('./models/Prescription').init(),
      require('./models/Message').init(),
      require('./models/Payment').init(),
      require('./models/PaymentEvent').init(),
    ]);
    console.log('MongoDB Connected');
    server = app.listen(PORT, () => {
      operations.setReady(true);
      console.log(`Server running on http://localhost:${PORT}`);
      reminderService.startReminderWorker();
    });
  })
  .catch((error) => {
    console.error('Database Connection Failed');
    console.error(error.message);
    process.exitCode = 1;
  });
