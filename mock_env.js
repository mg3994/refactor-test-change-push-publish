const fs = require('fs');

// Global mock objects
global.ContentService = {
  createTextOutput: (text) => ({
    setMimeType: () => ({
      getContent: () => text,
      toString: () => text
    })
  }),
  MimeType: { JSON: 'application/json' }
};

global.LockService = {
  getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperties: () => ({
      SPREADSHEET_ID: 'dummy'
    })
  })
};

global.Session = {
  getScriptTimeZone: () => 'UTC'
};

global.Utilities = {
  formatDate: () => '20231010',
  getUuid: () => 'uuid-123',
  newBlob: () => ({ getBytes: () => [], getDataAsString: () => "" }),
  base64DecodeWebSafe: () => [],
  verifyRsaSha256Signature: () => true,
  computeRsaSha256Signature: () => []
};

global.Logger = {
  log: (msg) => console.log(msg)
};

global.UrlFetchApp = {
  fetch: () => ({ getContentText: () => '{}', getResponseCode: () => 200 }),
  fetchAll: () => []
};

global.CacheService = {
  getScriptCache: () => ({ get: () => null, put: () => {} })
};

global.Maps = {
  newGeocoder: () => ({
    geocode: () => ({ results: [{ geometry: { location: { lat: 0, lng: 0 } }, formatted_address: "Mock Address" }] }),
    reverseGeocode: () => ({ results: [{ formatted_address: "Mock Address" }] })
  }),
  newDirectionFinder: () => ({
    setOrigin: function() { return this; },
    setDestination: function() { return this; },
    setMode: function() { return this; },
    getDirections: () => ({ routes: [{ legs: [{ distance: { value: 1000, text: "1 km" }, duration: { value: 60, text: "1 min" } }] }] })
  })
};

const mockSheet = (name) => ({
  appendRow: () => {},
  deleteRow: () => {},
  getDataRange: () => ({
    getValues: () => {
      if (name === 'products') return [['product_id', 'title', 'description', 'price', 'image_url', 'stock', 'category_ids', 'created_at']];
      if (name === 'orders') return [['order_id', 'firebase_uid', 'product_details', 'total_amount', 'travel_fee', 'status', 'shipping_phone', 'full_address', 'latitude', 'longitude', 'customer_note', 'created_at', 'updated_at']];
      if (name === 'logs') return [['timestamp', 'action', 'firebase_uid', 'status', 'details']];
      if (name === 'categories') return [['category_id', 'title', 'description', 'created_at']];
      if (name === 'coupons') return [['coupon_id', 'code', 'type', 'value', 'min_order_amount', 'max_discount', 'expiry_date', 'usage_limit', 'usage_count', 'is_active', 'created_at']];
      if (name === 'profiles') return [['firebase_uid', 'display_name', 'email', 'phone_number', 'saved_addresses', 'preferences', 'created_at', 'updated_at']];
      if (name === 'wishlists') return [['firebase_uid', 'product_ids', 'updated_at']];
      return [['id']];
    }
  }),
  getRange: () => ({
    setValues: () => {},
    getValues: () => [[]],
    setFontWeight: () => ({ setBackground: () => {} }),
    getLastRow: () => 1
  }),
  getLastRow: () => 1,
  getLastColumn: () => 10
});

const mockSS = {
  getSheetByName: (name) => mockSheet(name),
  insertSheet: (name) => mockSheet(name)
};

global.SpreadsheetApp = {
  openById: () => mockSS,
  getActiveSpreadsheet: () => mockSS,
  flush: () => {}
};

// Load GAS files in order
const files = ['constants.gs', 'core.gs', 'repositories.gs', 'services.gs', 'use_cases.gs', 'bootstrap.gs', 'main.gs', 'tests.gs'];
let combinedContent = "";
files.forEach(file => {
  combinedContent += fs.readFileSync(file, 'utf8') + "\n";
});

eval(combinedContent);

// Run tests
const results = runTests();
const failed = results.filter(r => r.status === 'FAIL');
if (failed.length > 0) {
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
}
