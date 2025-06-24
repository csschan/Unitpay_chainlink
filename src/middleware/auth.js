// src/middleware/auth.js
// Stub authentication middleware: skip auth checks and proceed
module.exports.authenticate = (req, res, next) => {
  next();
}; 