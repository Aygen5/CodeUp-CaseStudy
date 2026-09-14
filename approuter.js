/**
 * SAP Approuter Starter for CodeUp Supplier Management
 * Listens on port 5000 and reverse proxies requests to CAP backend (4004)
 * and UI5 applications (app/supplierportal, app/supplier-approvals).
 */
const approuter = require('@sap/approuter');

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
