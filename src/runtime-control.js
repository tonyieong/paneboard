const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function controlTokenPath(root) {
  return path.join(root, 'data', 'control-token');
}

function loadOrCreateControlToken(root) {
  const tokenPath = controlTokenPath(root);
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  if (fs.existsSync(tokenPath)) {
    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    if (token) {
      return token;
    }
  }
  const token = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === 'localhost';
}

function verifyRuntimeControlRequest(req, token) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    return false;
  }
  return (req.headers['x-paneboard-control-token'] ?? req.headers['x-wps7-control-token']) === token;
}

function requireRuntimeControl(token) {
  return (req, res, next) => {
    if (verifyRuntimeControlRequest(req, token)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Runtime control denied.' });
  };
}

module.exports = {
  controlTokenPath,
  isLoopbackAddress,
  loadOrCreateControlToken,
  requireRuntimeControl,
  verifyRuntimeControlRequest
};
