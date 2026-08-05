const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const c = require('../controllers/paymentController');
const router = express.Router(); router.use(protect);
router.post('/appointments/:appointmentId/checkout', authorize('patient'), c.createCheckout);
router.get('/mine', authorize('patient'), c.listMine);
router.post('/:id/refund', authorize('admin'), c.refund);
module.exports = router;
