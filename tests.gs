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
    testEcommerceUseCaseInitialization
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
