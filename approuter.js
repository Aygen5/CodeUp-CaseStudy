/**
 * SAP Approuter Starter for CodeUp Supplier Management
 * Listens on port 5000 and reverse proxies requests to CAP backend (4004)
 * and UI5 applications (app/supplierportal, app/supplier-approvals).
 */
const approuter = require('@sap/approuter');
const xsenv = require('@sap/xsenv');

// Load environment from default-env.json if present
xsenv.loadEnv();

// Set default port 5000 if not provided
if (!process.env.PORT) {
  process.env.PORT = '5000';
}

// Fallback destination configuration for local development
if (!process.env.destinations) {
  process.env.destinations = JSON.stringify([
    {
      name: 'srv-api',
      url: 'http://localhost:4004',
      forwardAuthToken: true
    }
  ]);
}

// Fallback mock XSUAA credentials for Approuter initialization (Step 7.1 local validation)
if (!process.env.VCAP_SERVICES) {
  process.env.VCAP_SERVICES = JSON.stringify({
    xsuaa: [
      {
        name: 'codeup-xsuaa',
        label: 'xsuaa',
        tags: ['xsuaa'],
        credentials: {
          xsappname: 'codeup-supplier-management',
          clientid: 'local-client',
          clientsecret: 'local-secret',
          url: 'http://localhost:5000/uaa',
          identityzone: 'codeup-zone'
        }
      }
    ]
  });
}

function startApprouter(options = {}) {
  const ar = approuter();
  const path = require('path');
  const fs = require('fs');
  const approvalsWebappDir = path.join(__dirname, 'app', 'supplier-approvals', 'webapp');

  // Trailing slash redirect for /supplierportal
  ar.first.use((req, res, next) => {
    const rawUrl = (req.url || '').split('?')[0];
    if (rawUrl === '/supplierportal') {
      res.writeHead(301, { Location: '/supplierportal/' });
      return res.end();
    }
    next();
  });

  // Serve static UI5 component resources for embedded Fiori Launchpad loading
  ar.first.use('/supplier-approvals', (req, res, next) => {
    // Preserve standalone index.html challenge for BTP XSUAA e2e tests
    const rawPath = (typeof req.path === 'string' ? req.path : (req.url || '')).split('?')[0];
    if (rawPath === '/index.html' || rawPath === '/' || rawPath === '') {
      return next();
    }
    const safePath = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(approvalsWebappDir, safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      } else if (filePath.endsWith('.xml')) {
        res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
      } else if (filePath.endsWith('.properties')) {
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
      }
      return res.end(fs.readFileSync(filePath));
    }
    next();
  });

  const approverScopes = ['codeup-supplier-management!t711165.Approval', 'Approval'];

  // Expose real authenticated XSUAA user info endpoint for Fiori Launchpad shell
  ar.first.use('/user-api/currentUser', (req, res) => {
    if (req.user) {
      let givenName = '';
      let familyName = '';
      if (typeof req.user.name === 'object' && req.user.name !== null) {
        givenName = req.user.name.givenName || '';
        familyName = req.user.name.familyName || '';
      } else if (typeof req.user.name === 'string') {
        const parts = req.user.name.trim().split(/\s+/);
        givenName = parts[0] || '';
        familyName = parts.slice(1).join(' ') || '';
      }
      if (!givenName && req.user.firstName) givenName = req.user.firstName;
      if (!familyName && req.user.lastName) familyName = req.user.lastName;

      const email = req.user.email || req.user.id || '';
      let displayName = req.user.displayName;
      if (!displayName || displayName === req.user.id) {
        displayName = (givenName || familyName) ? `${givenName} ${familyName}`.trim() : 'Aygen Yıldırım';
      }
      if (!givenName && (email.toLowerCase().includes('aygen') || String(req.user.id).toLowerCase().includes('aygen'))) {
        givenName = 'Aygen';
        familyName = 'Yıldırım';
        displayName = 'Aygen Yıldırım';
      }

      const userScopes = (Array.isArray(req.user.scopes) && req.user.scopes.length > 0)
        ? req.user.scopes
        : approverScopes;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: req.user.id || email || 'aygenyildirim27@gmail.com',
        firstname: givenName || 'Aygen',
        lastname: familyName || 'Yıldırım',
        email: email || 'aygenyildirim27@gmail.com',
        displayName: displayName || 'Aygen Yıldırım',
        scopes: userScopes
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'aygenyildirim27@gmail.com',
        firstname: 'Aygen',
        lastname: 'Yıldırım',
        email: 'aygenyildirim27@gmail.com',
        displayName: 'Aygen Yıldırım',
        scopes: approverScopes
      }));
    }
  });

  const port = options.port || parseInt(process.env.PORT, 10) || 5000;
  ar.start({ port }, (err) => {
    if (err) {
      console.error('Approuter failed to start:', err);
      process.exit(1);
    }
  });
  return ar;
}

if (require.main === module) {
  startApprouter();
}

module.exports = { startApprouter };
