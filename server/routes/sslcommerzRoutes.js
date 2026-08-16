const express = require('express');
const c = require('../controllers/paymentController');

// The gateway posts here, not the logged-in browser session, so these routes are
// unauthenticated by necessity. Trust comes from validating val_id, never the payload.
const router = express.Router();
router.post('/success', c.sslcommerzSuccess);
router.post('/fail', c.sslcommerzFail);
router.post('/cancel', c.sslcommerzCancel);
router.post('/ipn', c.sslcommerzIpn);
module.exports = router;
