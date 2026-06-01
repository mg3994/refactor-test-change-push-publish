/**
 * Use Cases for the Application (Refactored for Dependency Injection)
 */

var VerifyTokenUseCase = function(authService) {
  this.authService = authService;
};
VerifyTokenUseCase.prototype.execute = function(payload) {
  var result = this.authService.verifyToken(payload.idToken);
  if (!result.isValid) throw new Error(result.error);
  return result;
};

var SyncDeviceUseCase = function(authService, sessionRepo, utils) {
  this.authService = authService;
  this.sessionRepo = sessionRepo;
  this.utils = utils;
};
SyncDeviceUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  var uid = auth.uid || "guest";
  var self = this;
  return this.utils.withLock(function() {
    var exist = self.sessionRepo.findByClientId(payload.clientId);
    var now = new Date().toISOString();
    if (exist) {
      self.sessionRepo.updateRow(exist._rowIndex, { firebase_uid: uid, fcm_token: payload.deviceToken || "", last_synced: now });
    } else {
      self.sessionRepo.add([payload.clientId, uid, payload.deviceToken || "", payload.clientName || "Browser", now]);
    }
    return { synced: true };
  });
};

var LogoutDeviceUseCase = function(sessionRepo, utils) {
  this.sessionRepo = sessionRepo;
  this.utils = utils;
};
LogoutDeviceUseCase.prototype.execute = function(payload) {
  if (!payload.clientId) throw new Error("Client ID missing");
  var self = this;
  return this.utils.withLock(function() {
    var exist = self.sessionRepo.findByClientId(payload.clientId);
    if (exist) {
      self.sessionRepo.updateRow(exist._rowIndex, { firebase_uid: "guest", fcm_token: "", last_synced: new Date().toISOString() });
    }
    return { loggedOut: true };
  });
};

var GetNotificationsUseCase = function(authService, notificationRepo) {
  this.authService = authService;
  this.notificationRepo = notificationRepo;
};
GetNotificationsUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  if (!auth.isValid) throw new Error("Unauthorized");
  var page = parseInt(payload.page || 1, 10);
  var limit = parseInt(payload.limit || 10, 10);
  var all = this.notificationRepo.findByUid(auth.uid);
  if (payload.status) {
    all = all.filter(function(r) { return String(r.status).toLowerCase() === String(payload.status).toLowerCase(); });
  }
  all.sort(function(a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  var total = all.length;
  var paginated = all.slice((page - 1) * limit, page * limit);
  return {
    notifications: paginated,
    pagination: { total_records: total, total_pages: Math.ceil(total / limit), current_page: page, limit_per_page: limit }
  };
};

var SendNotificationUseCase = function(messagingService) {
  this.messagingService = messagingService;
};
SendNotificationUseCase.prototype.execute = function(payload) {
  var results = this.messagingService.sendMulticast(payload.tokens, payload.title, payload.body, payload.data);
  return { total: results.length, success: results.filter(function(r) { return r.success; }).length, details: results };
};

var BroadcastNotificationUseCase = function(messagingService) {
  this.messagingService = messagingService;
};
BroadcastNotificationUseCase.prototype.execute = function(payload) {
  var id = this.messagingService.broadcast(payload.topic, payload.title, payload.body, payload.data);
  return { topic: payload.topic || "all_users", messageId: id };
};

var VerifyLogisticsUseCase = function(locationService, config) {
  this.locationService = locationService;
  this.config = config;
};
VerifyLogisticsUseCase.prototype.execute = function(payload) {
  var lat = parseFloat(payload.pinLat);
  var lng = parseFloat(payload.pinLng);
  var addr = payload.userAddress || "";
  if (isNaN(lat) || isNaN(lng)) {
    var geo = this.locationService.geocode(addr);
    lat = geo.geometry.location.lat; lng = geo.geometry.location.lng; addr = geo.formatted_address;
  }
  var origin = this.config.HUB_LAT + "," + this.config.HUB_LNG;
  var route = this.locationService.getDistanceAndDuration(origin, lat + "," + lng);
  var dist = route.distance.value / 1000;
  return {
    normalizedAddress: addr, lat: lat, lng: lng, distanceKm: dist.toFixed(2),
    isServicable: dist <= this.config.MAX_SERVICE_RADIUS_KM,
    travelFee: Math.ceil(dist * this.config.TRAVEL_FEE_PER_KM)
  };
};

var GetPlaceSuggestionsUseCase = function(locationService) {
  this.locationService = locationService;
};
GetPlaceSuggestionsUseCase.prototype.execute = function(payload) {
  return { suggestions: this.locationService.getSuggestions(payload.inputToken) };
};

var ProcessLocationMetricsUseCase = function(locationService) {
  this.locationService = locationService;
};
ProcessLocationMetricsUseCase.prototype.execute = function(payload) {
  var geo = this.locationService.geocode(payload.destinationQuery);
  var route = this.locationService.getDistanceAndDuration(payload.originLat + "," + payload.originLng, geo.geometry.location.lat + "," + geo.geometry.location.lng);
  return { status: "success", address: geo.formatted_address, lat: geo.geometry.location.lat, lng: geo.geometry.location.lng, distance: route.distance.text, duration: route.duration.text };
};

var ProcessPinDropMetricsUseCase = function(locationService) {
  this.locationService = locationService;
};
ProcessPinDropMetricsUseCase.prototype.execute = function(payload) {
  var rev = this.locationService.reverseGeocode(payload.pinLat, payload.pinLng);
  var route = this.locationService.getDistanceAndDuration(payload.originLat + "," + payload.originLng, payload.pinLat + "," + payload.pinLng);
  return { status: "success", address: rev.formatted_address, lat: payload.pinLat, lng: payload.pinLng, distance: route.distance.text, duration: route.duration.text };
};

var CreateOrderUseCase = function(authService, productRepo, orderRepo, utils) {
  this.authService = authService; this.productRepo = productRepo; this.orderRepo = orderRepo; this.utils = utils;
};
CreateOrderUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  if (!auth.isValid) throw new Error("Unauthorized");
  var self = this;
  return this.utils.withLock(function() {
    var items = payload.products || [];
    items.forEach(function(item) {
      var p = self.productRepo.findByProductId(item.product_id);
      if (!p || parseInt(p.stock, 10) < item.quantity) throw new Error("Insufficient stock for " + (p ? p.title : item.product_id));
      self.productRepo.updateRow(p._rowIndex, { stock: parseInt(p.stock, 10) - item.quantity });
    });
    var id = self.utils.generateId("ORD");
    var now = new Date().toISOString();
    self.orderRepo.add([id, auth.uid, JSON.stringify(items), payload.totalAmount, payload.travelFee || 0, "PENDING", payload.shippingPhone, payload.fullAddress, payload.latitude, payload.longitude, payload.customerNote || "", now, now]);
    return { orderId: id, status: "PENDING" };
  });
};

var CancelOrderUseCase = function(authService, productRepo, orderRepo, utils) {
  this.authService = authService; this.productRepo = productRepo; this.orderRepo = orderRepo; this.utils = utils;
};
CancelOrderUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  var self = this;
  return this.utils.withLock(function() {
    var o = self.orderRepo.findByOrderId(payload.orderId);
    if (!o || o.firebase_uid !== auth.uid) throw new Error("Order not found or permission denied");
    if (o.status === "CANCELLED") throw new Error("Already cancelled");
    JSON.parse(o.product_details || "[]").forEach(function(item) {
      var p = self.productRepo.findByProductId(item.product_id);
      if (p) self.productRepo.updateRow(p._rowIndex, { stock: parseInt(p.stock, 10) + item.quantity });
    });
    self.orderRepo.updateRow(o._rowIndex, { status: "CANCELLED", updated_at: new Date().toISOString() });
    return { cancelled: true };
  });
};

var GetProductsUseCase = function(productRepo) { this.productRepo = productRepo; };
GetProductsUseCase.prototype.execute = function(payload) {
  var all = this.productRepo.getAll();
  if (payload.categoryId) {
    all = all.filter(function(p) { return p.category_ids && p.category_ids.split(",").indexOf(payload.categoryId) !== -1; });
  }
  return { products: all };
};

var GetCategoriesUseCase = function(categoryRepo) { this.categoryRepo = categoryRepo; };
GetCategoriesUseCase.prototype.execute = function() { return { categories: this.categoryRepo.getAll() }; };

var AddReviewUseCase = function(authService, reviewRepo) { this.authService = authService; this.reviewRepo = reviewRepo; };
AddReviewUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  this.reviewRepo.add([payload.productId, payload.orderId || "", payload.reviewText, payload.starRating, new Date().toISOString()]);
  return { reviewed: true };
};

var GetReviewsUseCase = function(reviewRepo) { this.reviewRepo = reviewRepo; };
GetReviewsUseCase.prototype.execute = function(payload) { return { reviews: this.reviewRepo.findByProductId(payload.productId) }; };

var SearchProductsUseCase = function(productRepo) { this.productRepo = productRepo; };
SearchProductsUseCase.prototype.execute = function(payload) {
  var q = (payload.query || "").toLowerCase();
  var all = this.productRepo.getAll();
  if (q) all = all.filter(function(p) { return (p.title || "").toLowerCase().indexOf(q) !== -1 || (p.description || "").toLowerCase().indexOf(q) !== -1; });
  return { products: all };
};

var ProcessPaymentUseCase = function(authService, paymentRepo, utils) {
  this.authService = authService; this.paymentRepo = paymentRepo; this.utils = utils;
};
ProcessPaymentUseCase.prototype.execute = function(payload) {
  var auth = this.authService.verifyToken(payload.idToken);
  var method = "UPI", desc = "Standard Transaction", ref = payload.transactionRef || "";
  if (payload.googlePayResponse) {
    var d = payload.googlePayResponse.details.paymentMethodData;
    method = d.type; desc = d.description; ref = d.tokenizationData.token;
  }
  var id = this.utils.generateId("PAY");
  this.paymentRepo.add([id, ref, "", auth.uid, payload.orderId, payload.amount, "SUCCESS", method, desc, JSON.stringify(payload.googlePayResponse || payload.metadata || {}), new Date().toISOString()]);
  return { paymentId: id, status: "SUCCESS", method: method };
};

// Application Assembly
(function() {
  var s = App.Services, r = App.Repositories, u = App.Utils, c = App.Config;
  App.UseCases = {
    verifyToken: new VerifyTokenUseCase(s.Auth),
    syncDevice: new SyncDeviceUseCase(s.Auth, r.Sessions, u),
    logoutDevice: new LogoutDeviceUseCase(r.Sessions, u),
    getNotifications: new GetNotificationsUseCase(s.Auth, r.Notifications),
    sendNotification: new SendNotificationUseCase(s.Messaging),
    broadcastNotification: new BroadcastNotificationUseCase(s.Messaging),
    verifyLogistics: new VerifyLogisticsUseCase(s.Location, c),
    getPlaceSuggestions: new GetPlaceSuggestionsUseCase(s.Location),
    processLocationMetrics: new ProcessLocationMetricsUseCase(s.Location),
    processPinDropMetrics: new ProcessPinDropMetricsUseCase(s.Location),
    createOrder: new CreateOrderUseCase(s.Auth, r.Products, r.Orders, u),
    cancelOrder: new CancelOrderUseCase(s.Auth, r.Products, r.Orders, u),
    getProducts: new GetProductsUseCase(r.Products),
    getCategories: new GetCategoriesUseCase(r.Categories),
    addReview: new AddReviewUseCase(s.Auth, r.Reviews),
    getReviews: new GetReviewsUseCase(r.Reviews),
    searchProducts: new SearchProductsUseCase(r.Products),
    processPayment: new ProcessPaymentUseCase(s.Auth, r.Payments, u)
  };
})();
