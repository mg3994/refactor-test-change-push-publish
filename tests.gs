/**
 * Simple Test Runner for the Application
 */
function runTests() {
  var tests = [
    testConfigInitialization,
    testRepositoryInitialization,
    testServiceInitialization,
    testUseCaseInitialization,
    testMiddlewarePipeline,
    testGooglePayProcessing,
    testInventoryManagement,
    testProductSearch,
    testUnauthorizedAccess,
    testEventDispatcher,
    testOrderHistory,
    testAuditLogging,
    testPaymentReconciliation
  ];

  var results = [];
  tests.forEach(function(test) {
    try {
      test();
      results.push({ name: test.name, status: "PASS" });
    } catch (e) {
      results.push({ name: test.name, status: "FAIL", error: e.toString() });
    }
  });

  Logger.log("Test Results:");
  results.forEach(function(r) {
    Logger.log(r.status + ": " + r.name + (r.error ? " -> " + r.error : ""));
  });

  return results;
}

function testConfigInitialization() {
  if (!App.Config) throw new Error("Config not initialized");
  if (!App.Config.SPREADSHEET_ID) throw new Error("Config missing SPREADSHEET_ID");
}

function testRepositoryInitialization() {
  var r = App.Repositories;
  if (!r.Sessions || !r.Notifications || !r.Orders || !r.Products || !r.Payments) throw new Error("Repositories missing");
}

function testServiceInitialization() {
  var s = App.Services;
  if (!s.Auth || !s.Messaging || !s.Location) throw new Error("Services missing");
}

function testUseCaseInitialization() {
  var u = App.UseCases;
  if (!u.syncDevice || !u.getNotifications || !u.createOrder || !u.processPayment) throw new Error("Use Cases missing");
}

function testMiddlewarePipeline() {
  var mockE = { postData: { contents: JSON.stringify({ action: "GET_CATEGORIES" }) } };
  var res = AppController.handleRequest(mockE);
  var content = JSON.parse(res.getContent ? res.getContent() : res.toString());
  if (!content.success) throw new Error("Middleware pipeline failed: " + content.error);
}

function testGooglePayProcessing() {
  var gpayPayload = {
    "method": "https://google.com/pay",
    "payer": { "name": "Test Payer", "email": "test@test.com", "phone": "123" },
    "details": {
      "paymentMethodData": {
        "description": "Visa 1111",
        "tokenizationData": { "token": "tok_123" },
        "type": "CARD"
      }
    }
  };

  var payload = {
    user: { uid: "u123" },
    orderId: "ORD-1",
    amount: 100,
    googlePayResponse: gpayPayload
  };

  var result = App.UseCases.processPayment.execute(payload);
  if (result.method !== "CARD") throw new Error("Expected CARD, got " + result.method);
}

function testInventoryManagement() {
  var mockProduct = { _rowIndex: 2, product_id: "P1", stock: 10, title: "Test" };
  var originalFind = App.Repositories.Products.findByProductId;
  var originalUpdate = App.Repositories.Products.updateRow;
  var updatedStock = 0;

  App.Repositories.Products.findByProductId = function() { return mockProduct; };
  App.Repositories.Products.updateRow = function(idx, data) { if(data.stock !== undefined) updatedStock = data.stock; };

  try {
    App.UseCases.createOrder.execute({
      user: { uid: "u1" },
      products: [{ product_id: "P1", quantity: 3 }],
      totalAmount: 10
    });
    if (updatedStock !== 7) throw new Error("Stock error: " + updatedStock);
  } finally {
    App.Repositories.Products.findByProductId = originalFind;
    App.Repositories.Products.updateRow = originalUpdate;
  }
}

function testProductSearch() {
  var originalGetAll = App.Repositories.Products.getAll;
  App.Repositories.Products.getAll = function() {
    return [{ title: "iPhone" }, { title: "Samsung" }];
  };
  try {
    var res = App.UseCases.searchProducts.execute({ query: "iphone" });
    if (res.products.length !== 1) throw new Error("Search failed");
  } finally {
    App.Repositories.Products.getAll = originalGetAll;
  }
}

function testUnauthorizedAccess() {
  var action = App.Constants.ACTIONS.GET_NOTIFICATIONS;
  var mockE = { postData: { contents: JSON.stringify({ action: action, idToken: "bad" }) } };
  var originalVerify = App.Services.Auth.verifyToken;
  App.Services.Auth.verifyToken = function() { return { isValid: false, error: "Invalid Token" }; };

  try {
    var res = AppController.handleRequest(mockE);
    var content = JSON.parse(res.getContent ? res.getContent() : res.toString());
    if (content.status !== 401) throw new Error("Expected 401, got " + content.status);
  } finally {
    App.Services.Auth.verifyToken = originalVerify;
  }
}

function testEventDispatcher() {
  var called = false;
  App.EventDispatcher.on("TEST_EVENT", function(data) {
    if (data.msg === "hello") called = true;
  });
  App.EventDispatcher.dispatch("TEST_EVENT", { msg: "hello" });
  if (!called) throw new Error("Event dispatcher failed");
}

function testOrderHistory() {
  var originalFindByUid = App.Repositories.Orders.findByUid;
  App.Repositories.Orders.findByUid = function() {
    return [{ order_id: "O1", created_at: "2023-01-01" }];
  };
  try {
    var res = App.UseCases.getOrders.execute({ user: { uid: "u1" } });
    if (res.orders.length !== 1) throw new Error("Order history failed");
  } finally {
    App.Repositories.Orders.findByUid = originalFindByUid;
  }
}

function testAuditLogging() {
  var lastLog = null;
  var originalAdd = App.Repositories.Logs.add;
  App.Repositories.Logs.add = function(data) { lastLog = data; };

  try {
    AppController.handleRequest({ postData: { contents: JSON.stringify({ action: "GET_CATEGORIES" }) } });
    if (!lastLog || lastLog[1] !== "GET_CATEGORIES") throw new Error("Audit log missing or incorrect");
  } finally {
    App.Repositories.Logs.add = originalAdd;
  }
}

function testPaymentReconciliation() {
  var updatedStatus = "";
  var originalFind = App.Repositories.Orders.findByOrderId;
  var originalUpdate = App.Repositories.Orders.updateRow;

  App.Repositories.Orders.findByOrderId = function() { return { _rowIndex: 2, status: "PENDING" }; };
  App.Repositories.Orders.updateRow = function(idx, data) { updatedStatus = data.status; };

  try {
    App.EventDispatcher.dispatch("PAYMENT_COMPLETED", { orderId: "O1" });
    if (updatedStatus !== "PAID") throw new Error("Reconciliation failed: " + updatedStatus);
  } finally {
    App.Repositories.Orders.findByOrderId = originalFind;
    App.Repositories.Orders.updateRow = originalUpdate;
  }
}
