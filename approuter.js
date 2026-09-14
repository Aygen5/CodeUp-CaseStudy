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

  // Expose real authenticated XSUAA user info endpoint for Fiori Launchpad shell
  ar.first.use('/user-api/currentUser', (req, res) => {
    if (req.user) {
      const givenName = req.user.name?.givenName || '';
      const familyName = req.user.name?.familyName || '';
      const email = req.user.email || req.user.id || '';
      const displayName = (givenName || familyName) ? `${givenName} ${familyName}`.trim() : email;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: req.user.id,
        firstname: givenName,
        lastname: familyName,
        email: email,
        displayName: displayName,
        scopes: req.user.scopes || []
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: null,
        firstname: null,
        lastname: null,
        email: null,
        displayName: null,
        scopes: []
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
