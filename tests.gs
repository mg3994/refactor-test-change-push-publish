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
    testPaymentReconciliation,
    testTypeSafeValidation,
    testServerSidePriceCalculation,
    testAdvancedValidation,
    testEnrichedOrderDetails,
    testStandardizedResponse,
    testRatingAggregation,
    testVerifiedPurchaseTag,
    testBatchStockAdjustment,
    testRefundLogic,
    testStatusUpdate
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
  // Test success path
  var mockE = { postData: { contents: JSON.stringify({ action: "GET_CATEGORIES" }) } };
  var res = AppController.handleRequest(mockE);
  var content = JSON.parse(res.getContent ? res.getContent() : res.toString());
  if (!content.success) throw new Error("Middleware pipeline failed: " + content.error);

  // Test validation fail path
  var mockEFail = { postData: { contents: JSON.stringify({ action: "GET_REVIEWS" }) } }; // Missing productId
  var resFail = AppController.handleRequest(mockEFail);
  var contentFail = JSON.parse(resFail.getContent ? resFail.getContent() : resFail.toString());
  if (contentFail.success) throw new Error("Validation should have failed for missing productId");
  if (contentFail.status !== 400) throw new Error("Expected 400 for validation error, got " + contentFail.status);
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
  var mockProduct = { _rowIndex: 2, product_id: "P1", stock: 10, title: "Test", price: 10 };
  var originalFind = App.Repositories.Products.findByProductId;
  var originalUpdateRows = App.Repositories.Products.updateRows;
  var updatedStock = 0;

  App.Repositories.Products.findByProductId = function() { return mockProduct; };
  App.Repositories.Products.updateRows = function(configs) {
    if(configs[0].data.stock !== undefined) updatedStock = configs[0].data.stock;
  };

  try {
    App.UseCases.createOrder.execute({
      user: { uid: "u1" },
      products: [{ product_id: "P1", quantity: 3 }],
      travelFee: 0
    });
    if (updatedStock !== 7) throw new Error("Stock error: " + updatedStock);
  } finally {
    App.Repositories.Products.findByProductId = originalFind;
    App.Repositories.Products.updateRows = originalUpdateRows;
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

function testTypeSafeValidation() {
  var schema = { a: "string", b: "number", c: "array" };
  try {
    App.Utils.validate({ a: "s", b: 1, c: [] }, schema);
  } catch (e) {
    throw new Error("Should have passed validation: " + e);
  }

  try {
    App.Utils.validate({ a: 1, b: 1, c: [] }, schema);
    throw new Error("Should have failed string type check");
  } catch (e) {
    if (e.message.indexOf("must be a string") === -1) throw e;
  }
}

function testServerSidePriceCalculation() {
  var originalFind = App.Repositories.Products.findByProductId;
  App.Repositories.Products.findByProductId = function() {
    return { _rowIndex: 2, price: 50, stock: 10, title: "T" };
  };

  try {
    var res = App.UseCases.createOrder.execute({
      user: { uid: "u1" },
      products: [{ product_id: "P1", quantity: 2 }],
      travelFee: 10
    });
    if (res.totalCalculated !== 110) throw new Error("Price calculation incorrect: " + res.totalCalculated);
  } finally {
    App.Repositories.Products.findByProductId = originalFind;
  }
}

function testAdvancedValidation() {
  var schema = { val: { type: "number", min: 10, max: 20 } };
  try { App.Utils.validate({ val: 5 }, schema); throw new Error("Min fail"); } catch (e) {}
  try { App.Utils.validate({ val: 25 }, schema); throw new Error("Max fail"); } catch (e) {}
  App.Utils.validate({ val: 15 }, schema);

  var pSchema = { code: { type: "string", pattern: "^[A-Z]{3}$" } };
  try { App.Utils.validate({ code: "ab" }, pSchema); throw new Error("Pattern fail"); } catch (e) {}
  App.Utils.validate({ code: "ABC" }, pSchema);
}

function testEnrichedOrderDetails() {
  var originalOrderFind = App.Repositories.Orders.findByOrderId;
  var originalProdFind = App.Repositories.Products.findByProductId;

  App.Repositories.Orders.findByOrderId = function() {
    return { order_id: "O1", firebase_uid: "u1", product_details: JSON.stringify([{ product_id: "P1", quantity: 1 }]) };
  };
  App.Repositories.Products.findByProductId = function() {
    return { title: "Enriched Product", price: 100 };
  };

  try {
    var res = App.UseCases.getOrderDetails.execute({ user: { uid: "u1" }, orderId: "O1" });
    if (!res.order.items[0].title) throw new Error("Enrichment failed");
    if (res.order.items[0].title !== "Enriched Product") throw new Error("Title mismatch");
  } finally {
    App.Repositories.Orders.findByOrderId = originalOrderFind;
    App.Repositories.Products.findByProductId = originalProdFind;
  }
}

function testStandardizedResponse() {
  var res = App.Response.success({ some: "data" }, "TEST_ACTION");
  var content = JSON.parse(res.getContent ? res.getContent() : res.toString());
  if (!content.timestamp) throw new Error("Timestamp missing");
  if (content.action !== "TEST_ACTION") throw new Error("Action mismatch");
}

function testRatingAggregation() {
  var originalReviews = App.Repositories.Reviews.findByProductId;
  var originalProducts = App.Repositories.Products.getAll;

  App.Repositories.Reviews.findByProductId = function() {
    return [{ star_rating: 5 }, { star_rating: 4 }];
  };
  App.Repositories.Products.getAll = function() {
    return [{ product_id: "P1", title: "T" }];
  };

  try {
    var res = App.UseCases.getProducts.execute({});
    var p = res.products[0];
    if (!p || p.averageRating !== 4.5) throw new Error("Avg rating mismatch: " + (p ? p.averageRating : "null"));
    if (p.reviewCount !== 2) throw new Error("Review count mismatch");
  } finally {
    App.Repositories.Reviews.findByProductId = originalReviews;
    App.Repositories.Products.getAll = originalProducts;
  }
}

function testVerifiedPurchaseTag() {
  var originalReviews = App.Repositories.Reviews.findByProductId;
  var originalOrders = App.Repositories.Orders.findByUid;

  App.Repositories.Reviews.findByProductId = function() {
    return [{ product_id: "P1", star_rating: 5 }];
  };
  App.Repositories.Orders.findByUid = function() {
    return [{ product_details: JSON.stringify([{ product_id: "P1" }]) }];
  };

  try {
    var res = App.UseCases.getReviews.execute({ productId: "P1", user: { uid: "u1" } });
    if (!res.reviews[0].isVerifiedPurchase) throw new Error("Verified Purchase tag missing");
  } finally {
    App.Repositories.Reviews.findByProductId = originalReviews;
    App.Repositories.Orders.findByUid = originalOrders;
  }
}

function testBatchStockAdjustment() {
  var originalFind = App.Repositories.Products.findByProductId;
  var originalUpdateRows = App.Repositories.Products.updateRows;
  var lastUpdate = null;

  App.Repositories.Products.findByProductId = function() { return { _rowIndex: 2, stock: 10, title: "T" }; };
  App.Repositories.Products.updateRows = function(configs) { lastUpdate = configs; };

  try {
    App.Repositories.Products.adjustStockBatch([{ productId: "P1", delta: -2 }, { productId: "P2", delta: 5 }]);
    if (lastUpdate.length !== 2) throw new Error("Batch update length mismatch");
    if (lastUpdate[0].data.stock !== 8) throw new Error("Stock delta mismatch");
  } finally {
    App.Repositories.Products.findByProductId = originalFind;
    App.Repositories.Products.updateRows = originalUpdateRows;
  }
}

function testRefundLogic() {
  var originalFind = App.Repositories.Payments.findById;
  var originalUpdate = App.Repositories.Payments.updateRow;
  var updated = false;

  App.Repositories.Payments.findById = function() { return { _rowIndex: 2, status: "SUCCESS", payment_id: "PAY1" }; };
  App.Repositories.Payments.updateRow = function() { updated = true; };

  try {
    App.UseCases.refundPayment.execute({ paymentId: "PAY1" });
    if (!updated) throw new Error("Payment not updated during refund");
  } finally {
    App.Repositories.Payments.findById = originalFind;
    App.Repositories.Payments.updateRow = originalUpdate;
  }
}

function testStatusUpdate() {
  var originalFind = App.Repositories.Orders.findByOrderId;
  var originalUpdate = App.Repositories.Orders.updateRow;
  var newStatus = "";

  App.Repositories.Orders.findByOrderId = function() { return { _rowIndex: 2, order_id: "O1" }; };
  App.Repositories.Orders.updateRow = function(idx, data) { newStatus = data.status; };

  try {
    App.UseCases.updateOrderStatus.execute({ orderId: "O1", status: "SHIPPED" });
    if (newStatus !== "SHIPPED") throw new Error("Status update failed");
  } finally {
    App.Repositories.Orders.findByOrderId = originalFind;
    App.Repositories.Orders.updateRow = originalUpdate;
  }
}
