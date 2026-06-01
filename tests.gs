/**
 * Simple Test Runner for the Application
 */
function runTests() {
  var tests = [
    testConfigInitialization,
    testRepositoryInitialization,
    testServiceInitialization,
    testUseCaseInitialization,
    testEcommerceRepositoryInitialization,
    testEcommerceUseCaseInitialization,
    testGooglePayProcessing,
    testInventoryManagement,
    testProductSearch
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
  if (!App.Repositories.Sessions) throw new Error("Sessions repository missing");
  if (!App.Repositories.Notifications) throw new Error("Notifications repository missing");
  if (!App.Repositories.Orders) throw new Error("Orders repository missing");
}

function testServiceInitialization() {
  if (!App.Services.Auth) throw new Error("Auth service missing");
  if (!App.Services.Messaging) throw new Error("Messaging service missing");
  if (!App.Services.Location) throw new Error("Location service missing");
}

function testUseCaseInitialization() {
  if (!App.UseCases.syncDevice) throw new Error("syncDevice use case missing");
  if (!App.UseCases.getNotifications) throw new Error("getNotifications use case missing");
}

function testEcommerceRepositoryInitialization() {
  if (!App.Repositories.Products) throw new Error("Products repository missing");
  if (!App.Repositories.Categories) throw new Error("Categories repository missing");
  if (!App.Repositories.Reviews) throw new Error("Reviews repository missing");
  if (!App.Repositories.Payments) throw new Error("Payments repository missing");
}

function testEcommerceUseCaseInitialization() {
  if (!App.UseCases.getProducts) throw new Error("getProducts use case missing");
  if (!App.UseCases.addReview) throw new Error("addReview use case missing");
  if (!App.UseCases.processPayment) throw new Error("processPayment use case missing");
}

function testGooglePayProcessing() {
  var gpayPayload = {
    "method": "https://google.com/pay",
    "details": {
      "paymentMethodData": {
        "description": "Test Card: Visa •••• 1111",
        "tokenizationData": { "token": "exampleToken" },
        "type": "CARD"
      }
    }
  };

  var payload = { idToken: "valid", orderId: "ORD-1", amount: 100, googlePayResponse: gpayPayload };
  var originalVerify = App.Services.Auth.verifyToken;
  App.Services.Auth.verifyToken = function() { return { isValid: true, uid: "u1" }; };

  try {
    var result = App.UseCases.processPayment.execute(payload);
    if (result.method !== "CARD") throw new Error("Expected CARD, got " + result.method);
  } finally {
    App.Services.Auth.verifyToken = originalVerify;
  }
}

function testInventoryManagement() {
  var mockProduct = { _rowIndex: 2, product_id: "P1", stock: 10, title: "Test" };
  var originalFind = App.Repositories.Products.findByProductId;
  var originalUpdate = App.Repositories.Products.updateRow;
  var updatedStock = 0;

  App.Repositories.Products.findByProductId = function() { return mockProduct; };
  App.Repositories.Products.updateRow = function(idx, data) { if(data.stock !== undefined) updatedStock = data.stock; };

  var originalVerify = App.Services.Auth.verifyToken;
  App.Services.Auth.verifyToken = function() { return { isValid: true, uid: "u1" }; };

  try {
    App.UseCases.createOrder.execute({ idToken: "v", products: [{ product_id: "P1", quantity: 3 }], totalAmount: 10 });
    if (updatedStock !== 7) throw new Error("Stock error: " + updatedStock);
  } finally {
    App.Repositories.Products.findByProductId = originalFind;
    App.Repositories.Products.updateRow = originalUpdate;
    App.Services.Auth.verifyToken = originalVerify;
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
