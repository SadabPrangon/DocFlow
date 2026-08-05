const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

const notify = (user, data) => Notification.create({ user, ...data }).catch((error) => console.error('Notification error:', error.message));
const audit = (req, action, entity, entityId, details = {}) => AuditLog.create({
  actor: req.user?._id || null,
  action,
  entity,
  entityId: String(entityId || ''),
  details,
  ip: req.ip || '',
}).catch((error) => console.error('Audit error:', error.message));

module.exports = { notify, audit };
