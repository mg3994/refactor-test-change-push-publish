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
    testGooglePayProcessing
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
    "payer": {
      "name": "Card Holder Name",
      "email": "manishgautammg7@yahoo.com",
      "phone": "+1 650-555-5555"
    },
    "details": {
      "apiVersion": 2,
      "apiVersionMinor": 0,
      "email": "manishgautammg7@yahoo.com",
      "paymentMethodData": {
        "description": "Test Card: Visa •••• 1111",
        "info": {
          "billingAddress": {
            "countryCode": "US",
            "name": "Card Holder Name",
            "phoneNumber": "+1 650-555-5555",
            "postalCode": "94043"
          },
          "cardDetails": "1111",
          "cardFundingSource": "CREDIT",
          "cardNetwork": "VISA"
        },
        "tokenizationData": {
          "token": "examplePaymentMethodToken",
          "type": "PAYMENT_GATEWAY"
        },
        "type": "CARD"
      }
    }
  };

  var payload = {
    idToken: "valid_token",
    orderId: "ORD-123",
    amount: 100,
    googlePayResponse: gpayPayload
  };

  // Mock AuthService
  var originalVerify = App.Services.Auth.verifyToken;
  App.Services.Auth.verifyToken = function() { return { isValid: true, uid: "test_user" }; };

  try {
    var result = App.UseCases.processPayment(payload);
    if (result.status !== "SUCCESS") throw new Error("Payment failed");
    if (result.method !== "CARD") throw new Error("Expected method CARD, got " + result.method);
  } finally {
    App.Services.Auth.verifyToken = originalVerify;
  }
}
