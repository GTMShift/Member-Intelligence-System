require('dotenv').config();
const { startMonitoring } = require('./services/gmailMonitor');
startMonitoring();
