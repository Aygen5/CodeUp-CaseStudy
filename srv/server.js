const cds = require('@sap/cds');
const path = require('path');
const express = require('express');

cds.on('bootstrap', (app) => {
  // Static route mapping for UI5 applications during local CAP execution (Port 5001)
  app.use('/supplierportal', express.static(path.join(__dirname, '..', 'app', 'supplierportal', 'webapp')));
  app.use('/supplier-approvals', express.static(path.join(__dirname, '..', 'app', 'supplier-approvals', 'webapp')));

  // Public OData v4 endpoints: Safeguard against XSUAA JWT validation conflicts.
  // If an external supplier sends their custom token in the Authorization header,
  // map it to X-Supplier-Token and remove Authorization so XSUAA does not reject it with 401.
  app.use('/odata/v4/public', (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      if (!req.headers['x-supplier-token'] && !req.headers['X-Supplier-Token']) {
        req.headers['x-supplier-token'] = authHeader.substring(7).trim();
      }
      delete req.headers['authorization'];
      delete req.headers['Authorization'];
    }
    next();
  });
});

module.exports = cds.server;

