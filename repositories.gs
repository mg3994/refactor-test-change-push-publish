/**
 * Base Repository for Spreadsheet Operations
 */
var BaseRepository = function(sheetName) {
  this.sheetName = sheetName;
};

BaseRepository.prototype.getSheet = function() {
  return getOrCreateSheet(this.sheetName);
};

BaseRepository.prototype.getAll = function() {
  return getSheetRowsAsJson(this.sheetName);
};

BaseRepository.prototype.findById = function(idField, idValue) {
  var rows = this.getAll();
  return rows.find(function(r) {
    return r[idField] == idValue;
  });
};

BaseRepository.prototype.findBy = function(filterFn) {
  var rows = this.getAll();
  return rows.filter(filterFn);
};

BaseRepository.prototype.add = function(dataArray) {
  var sheet = this.getSheet();
  sheet.appendRow(dataArray);
  SpreadsheetApp.flush();
};

BaseRepository.prototype.update = function(rowIndex, column, value) {
  var sheet = this.getSheet();
  sheet.getRange(rowIndex, column).setValue(value);
  SpreadsheetApp.flush();
};

BaseRepository.prototype.updateRow = function(rowIndex, dataMap) {
  var sheet = this.getSheet();
  var headers = SHEET_HEADERS[this.sheetName];
  for (var key in dataMap) {
    var colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowIndex, colIndex).setValue(dataMap[key]);
    }
  }
  SpreadsheetApp.flush();
};

/**
 * Session Repository
 */
var SessionRepository = function() {
  BaseRepository.call(this, "sessions");
};
SessionRepository.prototype = Object.create(BaseRepository.prototype);
SessionRepository.prototype.constructor = SessionRepository;

SessionRepository.prototype.findByClientId = function(clientId) {
  return this.findById("client_id", clientId);
};

/**
 * Notification Repository
 */
var NotificationRepository = function() {
  BaseRepository.call(this, "notifications");
};
NotificationRepository.prototype = Object.create(BaseRepository.prototype);
NotificationRepository.prototype.constructor = NotificationRepository;

NotificationRepository.prototype.findByUid = function(uid) {
  return this.findBy(function(r) {
    return String(r.firebase_uid) === String(uid);
  });
};

/**
 * Order Repository
 */
var OrderRepository = function() {
  BaseRepository.call(this, "orders");
};
OrderRepository.prototype = Object.create(BaseRepository.prototype);
OrderRepository.prototype.constructor = OrderRepository;

OrderRepository.prototype.findByOrderId = function(orderId) {
  return this.findById("order_id", orderId);
};

/**
 * Product Repository
 */
var ProductRepository = function() {
  BaseRepository.call(this, "products");
};
ProductRepository.prototype = Object.create(BaseRepository.prototype);
ProductRepository.prototype.constructor = ProductRepository;

ProductRepository.prototype.findByProductId = function(productId) {
  return this.findById("product_id", productId);
};

/**
 * Category Repository
 */
var CategoryRepository = function() {
  BaseRepository.call(this, "categories");
};
CategoryRepository.prototype = Object.create(BaseRepository.prototype);
CategoryRepository.prototype.constructor = CategoryRepository;

/**
 * Review Repository
 */
var ReviewRepository = function() {
  BaseRepository.call(this, "reviews");
};
ReviewRepository.prototype = Object.create(BaseRepository.prototype);
ReviewRepository.prototype.constructor = ReviewRepository;

ReviewRepository.prototype.findByProductId = function(productId) {
  return this.findBy(function(r) {
    return r.product_id == productId;
  });
};

/**
 * Payment Repository
 */
var PaymentRepository = function() {
  BaseRepository.call(this, "payments");
};
PaymentRepository.prototype = Object.create(BaseRepository.prototype);
PaymentRepository.prototype.constructor = PaymentRepository;

PaymentRepository.prototype.findByOrderId = function(orderId) {
  return this.findById("order_id", orderId);
};

// Initialize repositories in App namespace
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
