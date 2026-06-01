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
  var sheet = this.getSheet();
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj._rowIndex = i + 1;
    list.push(obj);
  }
  return list;
};

BaseRepository.prototype.findById = function(idField, idValue) {
  return this.getAll().find(function(r) { return r[idField] == idValue; });
};

BaseRepository.prototype.findBy = function(filterFn) {
  return this.getAll().filter(filterFn);
};

BaseRepository.prototype.add = function(dataArray) {
  var sheet = this.getSheet();
  sheet.appendRow(dataArray);
  SpreadsheetApp.flush();
};

BaseRepository.prototype.updateRow = function(rowIndex, dataMap) {
  var sheet = this.getSheet();
  var headers = App.Constants.SHEET_HEADERS[this.sheetName];
  for (var key in dataMap) {
    var colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowIndex, colIndex).setValue(dataMap[key]);
    }
  }
  SpreadsheetApp.flush();
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

var ProductRepository = function() { BaseRepository.call(this, "products"); };
ProductRepository.prototype = Object.create(BaseRepository.prototype);
ProductRepository.prototype.constructor = ProductRepository;
ProductRepository.prototype.findByProductId = function(id) { return this.findById("product_id", id); };

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

// Initialize repositories
(function() {
  App.Repositories = {
    Sessions: new SessionRepository(),
    Notifications: new NotificationRepository(),
    Orders: new OrderRepository(),
    Products: new ProductRepository(),
    Categories: new CategoryRepository(),
    Reviews: new ReviewRepository(),
    Payments: new PaymentRepository()
  };
})();
