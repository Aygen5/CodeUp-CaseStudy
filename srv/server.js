const cds = require('@sap/cds');
const path = require('path');
const express = require('express');

cds.on('bootstrap', (app) => {
  // Yerel çalıştırmada UI5 uygulamaları için statik dosya yolları
  app.use('/supplierportal', express.static(path.join(__dirname, '..', 'app', 'supplierportal', 'webapp')));
  app.use('/supplier-approvals', express.static(path.join(__dirname, '..', 'app', 'supplier-approvals', 'webapp')));

  // Tedarikçi token'ı Authorization başlığındaysa XSUAA 401 hatası vermesin diye
  // token'ı x-supplier-token başlığına taşır ve Authorization başlığını siler.
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

