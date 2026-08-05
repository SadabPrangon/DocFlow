const express = require('express');
const { protect } = require('../middleware/auth');
const c = require('../controllers/notificationController');
const router = express.Router();
router.use(protect);
router.get('/', c.list);
router.patch('/read-all', c.markAllRead);
router.patch('/:id/read', c.markRead);
module.exports = router;
