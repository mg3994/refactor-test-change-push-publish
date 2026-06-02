/**
 * Use Cases for the Application (Refactored to leverage Middleware)
 */

var VerifyTokenUseCase = function() {};
VerifyTokenUseCase.prototype.execute = function(payload) {
  return payload.user; // User info attached by Auth middleware
};

var SyncDeviceUseCase = function(sessionRepo, utils) {
  this.sessionRepo = sessionRepo;
  this.utils = utils;
};
SyncDeviceUseCase.prototype.execute = function(payload) {
  var uid = payload.user.uid || "guest";
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
  var self = this;
  return this.utils.withLock(function() {
    var exist = self.sessionRepo.findByClientId(payload.clientId);
    if (exist) {
      self.sessionRepo.updateRow(exist._rowIndex, { firebase_uid: "guest", fcm_token: "", last_synced: new Date().toISOString() });
    }
    return { loggedOut: true };
  });
};

var GetNotificationsUseCase = function(notificationRepo, utils) {
  this.notificationRepo = notificationRepo;
  this.utils = utils;
};
GetNotificationsUseCase.prototype.execute = function(payload) {
  var all = this.notificationRepo.findByUid(payload.user.uid);
  if (payload.status) {
    all = all.filter(function(r) { return String(r.status).toLowerCase() === String(payload.status).toLowerCase(); });
  }
  all.sort(function(a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

  var result = this.utils.paginate(all, payload.page, payload.limit);
  return { notifications: result.items, pagination: result.pagination };
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

var CreateOrderUseCase = function(productRepo, orderRepo, utils) {
  this.productRepo = productRepo; this.orderRepo = orderRepo; this.utils = utils;
};
CreateOrderUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var items = payload.products || [];
    var totalAmount = 0;

    items.forEach(function(item) {
      var product = self.productRepo.findByProductId(item.product_id);
      if (!product) throw new App.AppError("Product not found: " + item.product_id, 404);

      // Server-side total calculation to prevent manipulation
      totalAmount += parseFloat(product.price || 0) * parseInt(item.quantity, 10);

      self.productRepo.decrementStock(item.product_id, item.quantity);
    });

    // Add travel fee if applicable
    var finalAmount = totalAmount + parseFloat(payload.travelFee || 0);

    var id = self.utils.generateId("ORD");
    var now = new Date().toISOString();
    self.orderRepo.add([
      id,
      payload.user.uid,
      JSON.stringify(items),
      finalAmount,
      payload.travelFee || 0,
      "PENDING",
      payload.shippingPhone,
      payload.fullAddress,
      payload.latitude,
      payload.longitude,
      payload.customerNote || "",
      now,
      now
    ]);

    App.EventDispatcher.dispatch("ORDER_CREATED", { orderId: id, uid: payload.user.uid, amount: finalAmount });

    return { orderId: id, status: "PENDING", totalCalculated: finalAmount };
  });
};

var CancelOrderUseCase = function(productRepo, orderRepo, utils) {
  this.productRepo = productRepo; this.orderRepo = orderRepo; this.utils = utils;
};
CancelOrderUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var o = self.orderRepo.findByOrderId(payload.orderId);
    if (!o || o.firebase_uid !== payload.user.uid) throw new App.AppError("Order not found or permission denied", 403);
    if (o.status === "CANCELLED") throw new App.AppError("Already cancelled", 400);
    JSON.parse(o.product_details || "[]").forEach(function(item) {
      self.productRepo.incrementStock(item.product_id, item.quantity);
    });
    self.orderRepo.updateRow(o._rowIndex, { status: "CANCELLED", updated_at: new Date().toISOString() });
    return { cancelled: true };
  });
};

var GetOrdersUseCase = function(orderRepo, utils) {
  this.orderRepo = orderRepo; this.utils = utils;
};
GetOrdersUseCase.prototype.execute = function(payload) {
  var all = this.orderRepo.findByUid(payload.user.uid);
  all.sort(function(a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  var res = this.utils.paginate(all, payload.page, payload.limit);
  return { orders: res.items, pagination: res.pagination };
};

var GetOrderDetailsUseCase = function(orderRepo) {
  this.orderRepo = orderRepo;
};
GetOrderDetailsUseCase.prototype.execute = function(payload) {
  var o = this.orderRepo.findByOrderId(payload.orderId);
  if (!o || o.firebase_uid !== payload.user.uid) throw new App.AppError("Order not found", 404);
  return { order: o };
};

var GetProductsUseCase = function(productRepo, utils) { this.productRepo = productRepo; this.utils = utils; };
GetProductsUseCase.prototype.execute = function(payload) {
  var all = this.productRepo.getAll();
  if (payload.categoryId) {
    all = all.filter(function(p) { return p.category_ids && String(p.category_ids).split(",").indexOf(String(payload.categoryId)) !== -1; });
  }
  var result = this.utils.paginate(all, payload.page, payload.limit);
  return { products: result.items, pagination: result.pagination };
};

var GetCategoriesUseCase = function(categoryRepo) { this.categoryRepo = categoryRepo; };
GetCategoriesUseCase.prototype.execute = function() { return { categories: this.categoryRepo.getAll() }; };

var AddReviewUseCase = function(reviewRepo) { this.reviewRepo = reviewRepo; };
AddReviewUseCase.prototype.execute = function(payload) {
  this.reviewRepo.add([payload.productId, payload.orderId || "", payload.reviewText, payload.starRating, new Date().toISOString()]);
  return { reviewed: true };
};

var GetReviewsUseCase = function(reviewRepo) { this.reviewRepo = reviewRepo; };
GetReviewsUseCase.prototype.execute = function(payload) { return { reviews: this.reviewRepo.findByProductId(payload.productId) }; };

var SearchProductsUseCase = function(productRepo, utils) { this.productRepo = productRepo; this.utils = utils; };
SearchProductsUseCase.prototype.execute = function(payload) {
  var q = (payload.query || "").toLowerCase();
  var all = this.productRepo.getAll();

  // Search Filtering
  if (q) {
    all = all.filter(function(p) {
      return (p.title || "").toLowerCase().indexOf(q) !== -1 ||
             (p.description || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  // Stock Filtering
  if (payload.inStockOnly === "true") {
    all = all.filter(function(p) { return parseInt(p.stock || 0, 10) > 0; });
  }

  // Sorting
  if (payload.sortBy === "price_asc") {
    all.sort(function(a, b) { return parseFloat(a.price || 0) - parseFloat(b.price || 0); });
  } else if (payload.sortBy === "price_desc") {
    all.sort(function(a, b) { return parseFloat(b.price || 0) - parseFloat(a.price || 0); });
  }

  var result = this.utils.paginate(all, payload.page, payload.limit);
  return { products: result.items, pagination: result.pagination };
};

var ProcessPaymentUseCase = function(paymentRepo, utils) {
  this.paymentRepo = paymentRepo; this.utils = utils;
};
ProcessPaymentUseCase.prototype.execute = function(payload) {
  var method = "UPI", desc = "Standard Transaction", ref = payload.transactionRef || "";
  var pName = "", pEmail = "", pPhone = "";

  if (payload.googlePayResponse) {
    var g = payload.googlePayResponse;
    var d = g.details.paymentMethodData;
    method = d.type; desc = d.description; ref = d.tokenizationData.token;
    if (g.payer) {
      pName = g.payer.name || "";
      pEmail = g.payer.email || "";
      pPhone = g.payer.phone || "";
    }
  }

  var id = this.utils.generateId("PAY");
  // payment_id, transaction_ref, refund_ref, firebase_uid, order_id, amount, status, payment_method, payment_description, payer_name, payer_email, payer_phone, raw_metadata, created_at
  this.paymentRepo.add([
    id, ref, "", payload.user.uid, payload.orderId, payload.amount, "SUCCESS",
    method, desc, pName, pEmail, pPhone,
    JSON.stringify(payload.googlePayResponse || payload.metadata || {}),
    new Date().toISOString()
  ]);

  App.EventDispatcher.dispatch("PAYMENT_COMPLETED", { paymentId: id, orderId: payload.orderId, uid: payload.user.uid, amount: payload.amount });

  return { paymentId: id, status: "SUCCESS", method: method };
};

// Application Assembly
(function() {
  var s = App.Services, r = App.Repositories, u = App.Utils, c = App.Config;

  // Event Subscriptions
  App.EventDispatcher.on("ORDER_CREATED", function(data) {
    var sessions = r.Sessions.getAll().filter(function(s) { return s.firebase_uid === data.uid && s.fcm_token; });
    var tokens = sessions.map(function(s) { return s.fcm_token; });
    if (tokens.length > 0) {
      s.Messaging.sendMulticast(tokens, "Order Placed!", "Your order " + data.orderId + " has been created.", { orderId: data.orderId });
    }
  });

  App.EventDispatcher.on("PAYMENT_COMPLETED", function(data) {
    var order = r.Orders.findByOrderId(data.orderId);
    if (order && order.status === App.Constants.ORDER_STATUS.PENDING) {
      r.Orders.updateRow(order._rowIndex, { status: App.Constants.ORDER_STATUS.PAID, updated_at: new Date().toISOString() });
    }
  });

  App.UseCases = {
    verifyToken: new VerifyTokenUseCase(),
    syncDevice: new SyncDeviceUseCase(r.Sessions, u),
    logoutDevice: new LogoutDeviceUseCase(r.Sessions, u),
    getNotifications: new GetNotificationsUseCase(r.Notifications, u),
    sendNotification: new SendNotificationUseCase(s.Messaging),
    broadcastNotification: new BroadcastNotificationUseCase(s.Messaging),
    verifyLogistics: new VerifyLogisticsUseCase(s.Location, c),
    getPlaceSuggestions: new GetPlaceSuggestionsUseCase(s.Location),
    processLocationMetrics: new ProcessLocationMetricsUseCase(s.Location),
    processPinDropMetrics: new ProcessPinDropMetricsUseCase(s.Location),
    createOrder: new CreateOrderUseCase(r.Products, r.Orders, u),
    cancelOrder: new CancelOrderUseCase(r.Products, r.Orders, u),
    getOrders: new GetOrdersUseCase(r.Orders, u),
    getOrderDetails: new GetOrderDetailsUseCase(r.Orders),
    getProducts: new GetProductsUseCase(r.Products, u),
    getCategories: new GetCategoriesUseCase(r.Categories),
    addReview: new AddReviewUseCase(r.Reviews),
    getReviews: new GetReviewsUseCase(r.Reviews),
    searchProducts: new SearchProductsUseCase(r.Products, u),
    processPayment: new ProcessPaymentUseCase(r.Payments, u)
  };
})();
