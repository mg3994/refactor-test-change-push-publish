/**
 * Base Repository for Spreadsheet Operations
 */
var BaseRepository = function(sheetName) {
  this.sheetName = sheetName;
};

BaseRepository.prototype.getSheet = function() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var settings = getSettings();
    if (!settings.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID not configured");
    ss = SpreadsheetApp.openById(settings.SPREADSHEET_ID);
  }

  var sheet = ss.getSheetByName(this.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(this.sheetName);
    var headers = App.Constants.SHEET_HEADERS[this.sheetName] || [];
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E0E0E0");
    }
  }
  return sheet;
};

BaseRepository.prototype.getAll = function() {
  if (this._cache) return this._cache;

  var sheet = this.getSheet();
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var list = [];
  this._indexMap = {};
  var idKey = App.Constants.SHEET_HEADERS[this.sheetName][0]; // Assume first column is ID

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj._rowIndex = i + 1;
    list.push(obj);

    // Cache row index by ID for O(1) lookup
    if (obj[idKey]) {
      this._indexMap[obj[idKey]] = obj._rowIndex;
    }
  }
  this._cache = list;
  return list;
};

BaseRepository.prototype.findById = function(idField, idValue) {
  var idKey = App.Constants.SHEET_HEADERS[this.sheetName][0];
  if (idField === idKey && this._indexMap && this._indexMap[idValue]) {
    return this.getAll()[this._indexMap[idValue] - 2]; // O(1) via index map
  }
  return this.getAll().find(function(r) { return r[idField] == idValue; });
};

BaseRepository.prototype.findBy = function(filterFn) {
  return this.getAll().filter(filterFn);
};

BaseRepository.prototype.findMany = function(idField, idValues) {
  var vals = Array.isArray(idValues) ? idValues : [idValues];
  return this.getAll().filter(function(r) { return vals.indexOf(r[idField]) !== -1; });
};

BaseRepository.prototype.add = function(dataMap) {
  var sheet = this.getSheet();
  var headers = App.Constants.SHEET_HEADERS[this.sheetName];
  var row = new Array(headers.length).fill("");

  for (var key in dataMap) {
    var index = headers.indexOf(key);
    if (index >= 0) {
      row[index] = dataMap[key];
    }
  }

  sheet.appendRow(row);
  this._clearCache();
  SpreadsheetApp.flush();
};

BaseRepository.prototype.updateRow = function(rowIndex, dataMap) {
  this.updateRows([{ rowIndex: rowIndex, data: dataMap }]);
};

BaseRepository.prototype.updateRows = function(updateConfigs) {
  if (!updateConfigs || updateConfigs.length === 0) return;

  var sheet = this.getSheet();
  var headers = App.Constants.SHEET_HEADERS[this.sheetName];
  var self = this;

  updateConfigs.forEach(function(config) {
    var rowValues = sheet.getRange(config.rowIndex, 1, 1, headers.length).getValues()[0];
    for (var key in config.data) {
      var colIndex = headers.indexOf(key);
      if (colIndex >= 0) {
        rowValues[colIndex] = config.data[key];
      }
    }
    sheet.getRange(config.rowIndex, 1, 1, headers.length).setValues([rowValues]);
  });

  this._clearCache();
  SpreadsheetApp.flush();
};

BaseRepository.prototype._clearCache = function() {
  this._cache = null;
};

/**
 * Entity Specific Repositories
 */
var SessionRepository = function() { BaseRepository.call(this, "sessions"); };
SessionRepository.prototype = Object.create(BaseRepository.prototype);
SessionRepository.prototype.constructor = SessionRepository;
SessionRepository.prototype.findByClientId = function(id) { return this.findById("client_id", id); };

var NotificationRepository = function() { BaseRepository.call(this, "notifications"); };
NotificationRepository.prototype = Object.create(BaseRepository.prototype);
NotificationRepository.prototype.constructor = NotificationRepository;
NotificationRepository.prototype.findByUid = function(uid) {
  return this.findBy(function(r) { return String(r.firebase_uid) === String(uid); });
};

var OrderRepository = function() { BaseRepository.call(this, "orders"); };
OrderRepository.prototype = Object.create(BaseRepository.prototype);
OrderRepository.prototype.constructor = OrderRepository;
OrderRepository.prototype.findByOrderId = function(id) { return this.findById("order_id", id); };
OrderRepository.prototype.findByUid = function(uid) {
  return this.findBy(function(r) { return String(r.firebase_uid) === String(uid); });
};

var ProductRepository = function() { BaseRepository.call(this, "products"); };
ProductRepository.prototype = Object.create(BaseRepository.prototype);
ProductRepository.prototype.constructor = ProductRepository;
ProductRepository.prototype.findByProductId = function(id) { return this.findById("product_id", id); };

ProductRepository.prototype.decrementStock = function(productId, quantity) {
  var p = this.findByProductId(productId);
  if (!p) throw new Error("Product not found: " + productId);
  var current = parseInt(p.stock || 0, 10);
  if (current < quantity) throw new Error("Insufficient stock for " + p.title);
  this.updateRow(p._rowIndex, { stock: current - quantity });
};

ProductRepository.prototype.incrementStock = function(productId, quantity) {
  var p = this.findByProductId(productId);
  if (p) {
    var current = parseInt(p.stock || 0, 10);
    this.updateRow(p._rowIndex, { stock: current + quantity });
  }
};

ProductRepository.prototype.adjustStockBatch = function(adjustments) {
  var self = this;
  var updateConfigs = adjustments.map(function(adj) {
    var product = self.findByProductId(adj.productId);
    if (!product) throw new Error("Product not found: " + adj.productId);
    var current = parseInt(product.stock || 0, 10);
    var nextStock = current + adj.delta;
    if (nextStock < 0) throw new Error("Insufficient stock for " + product.title);
    return { rowIndex: product._rowIndex, data: { stock: nextStock } };
  });
  this.updateRows(updateConfigs);
};

var CategoryRepository = function() { BaseRepository.call(this, "categories"); };
CategoryRepository.prototype = Object.create(BaseRepository.prototype);
CategoryRepository.prototype.constructor = CategoryRepository;

var ReviewRepository = function() { BaseRepository.call(this, "reviews"); };
ReviewRepository.prototype = Object.create(BaseRepository.prototype);
ReviewRepository.prototype.constructor = ReviewRepository;
ReviewRepository.prototype.findByProductId = function(id) {
  return this.findBy(function(r) { return r.product_id == id; });
};

var PaymentRepository = function() { BaseRepository.call(this, "payments"); };
PaymentRepository.prototype = Object.create(BaseRepository.prototype);
PaymentRepository.prototype.constructor = PaymentRepository;

var LogRepository = function() { BaseRepository.call(this, "logs"); };
LogRepository.prototype = Object.create(BaseRepository.prototype);
LogRepository.prototype.constructor = LogRepository;

// Initialize repositories
(function() {
  App.Repositories = {
    Sessions: new SessionRepository(),
    Notifications: new NotificationRepository(),
    Orders: new OrderRepository(),
    Products: new ProductRepository(),
    Categories: new CategoryRepository(),
    Reviews: new ReviewRepository(),
    Payments: new PaymentRepository(),
    Logs: new LogRepository()
  };
})();
