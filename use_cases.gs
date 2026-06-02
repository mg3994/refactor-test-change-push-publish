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
      self.sessionRepo.add({ client_id: payload.clientId, firebase_uid: uid, fcm_token: payload.deviceToken || "", client_name: payload.clientName || "Browser", last_synced: now });
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

var ValidateCouponUseCase = function(couponRepo) {
  this.couponRepo = couponRepo;
};
ValidateCouponUseCase.prototype.execute = function(payload) {
  var coupon = this.couponRepo.findByCode(payload.code);
  if (!coupon) throw new App.AppError("Coupon not found", 404);
  if (!coupon.is_active) throw new App.AppError("Coupon is inactive", 400);

  var now = new Date();
  if (coupon.expiry_date && new Date(coupon.expiry_date) < now) {
    throw new App.AppError("Coupon has expired", 400);
  }

  if (coupon.usage_limit && parseInt(coupon.usage_count || 0) >= parseInt(coupon.usage_limit)) {
    throw new App.AppError("Coupon usage limit reached", 400);
  }

  if (payload.orderAmount && parseFloat(payload.orderAmount) < parseFloat(coupon.min_order_amount || 0)) {
    throw new App.AppError("Order amount too low for this coupon", 400);
  }

  return {
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: parseFloat(coupon.value),
    maxDiscount: parseFloat(coupon.max_discount || 999999)
  };
};

var CreateOrderUseCase = function(productRepo, orderRepo, couponRepo, utils) {
  this.productRepo = productRepo; this.orderRepo = orderRepo; this.couponRepo = couponRepo; this.utils = utils;
};
CreateOrderUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var items = payload.products || [];
    var totalAmount = 0;

    var adjustments = [];
    items.forEach(function(item) {
      var product = self.productRepo.findByProductId(item.product_id);
      if (!product) throw new App.AppError("Product not found: " + item.product_id, 404);

      totalAmount += parseFloat(product.price || 0) * parseInt(item.quantity, 10);

      var nextStock = parseInt(product.stock || 0, 10) - item.quantity;
      adjustments.push({ productId: item.product_id, delta: -item.quantity });

      if (nextStock <= App.Config.LOW_STOCK_THRESHOLD) {
        App.EventDispatcher.dispatch("LOW_STOCK_ALERT", { productId: item.product_id, stock: nextStock, title: product.title });
      }
    });

    self.productRepo.adjustStockBatch(adjustments);

    // Apply Coupon
    var discount = 0;
    if (payload.couponCode) {
      var validator = new ValidateCouponUseCase(self.couponRepo);
      var c = validator.execute({ code: payload.couponCode, orderAmount: totalAmount });
      if (c.type === App.Constants.COUPON_TYPE.PERCENTAGE) {
        discount = Math.min(totalAmount * (c.value / 100), c.maxDiscount);
      } else if (c.type === App.Constants.COUPON_TYPE.FIXED_AMOUNT) {
        discount = Math.min(c.value, totalAmount);
      }
      // Update usage count
      var coupon = self.couponRepo.findByCode(payload.couponCode);
      self.couponRepo.updateRow(coupon._rowIndex, { usage_count: parseInt(coupon.usage_count || 0) + 1 });
    }

    // Add travel fee if applicable
    var finalAmount = totalAmount - discount + parseFloat(payload.travelFee || 0);

    var id = self.utils.generateId("ORD");
    var now = new Date().toISOString();
    self.orderRepo.add({
      order_id: id,
      firebase_uid: payload.user.uid,
      product_details: JSON.stringify(items),
      total_amount: finalAmount,
      travel_fee: payload.travelFee || 0,
      status: "PENDING",
      shipping_phone: payload.shippingPhone,
      full_address: payload.fullAddress,
      latitude: payload.latitude,
      longitude: payload.longitude,
      customer_note: payload.customerNote || ""
    });

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

    App.StatusMachine.validateTransition(o.status, App.Constants.ORDER_STATUS.CANCELLED);

    var items = JSON.parse(o.product_details || "[]");
    var adjustments = items.map(function(item) {
      return { productId: item.product_id, delta: item.quantity };
    });

    self.productRepo.adjustStockBatch(adjustments);
    self.orderRepo.updateRow(o._rowIndex, { status: "CANCELLED", updated_at: new Date().toISOString() });
    return { cancelled: true };
  });
};

var GetOrdersUseCase = function(orderRepo, productRepo, utils) {
  this.orderRepo = orderRepo; this.productRepo = productRepo; this.utils = utils;
};
GetOrdersUseCase.prototype.execute = function(payload) {
  var all = this.orderRepo.findByUid(payload.user.uid);
  all.sort(function(a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

  // Enrich for list view summary
  var self = this;
  all.forEach(function(o) {
    var items = JSON.parse(o.product_details || "[]");
    o.item_count = items.length;
    if (items.length > 0) {
      var first = self.productRepo.findByProductId(items[0].product_id);
      o.summary_image = first ? first.image_url : "";
      o.summary_title = first ? (first.title + (items.length > 1 ? " & " + (items.length - 1) + " more" : "")) : "Order Items";
    }
  });

  var res = this.utils.paginate(all, payload.page, payload.limit);
  return { orders: res.items, pagination: res.pagination };
};

var GetOrderDetailsUseCase = function(orderRepo, productRepo) {
  this.orderRepo = orderRepo;
  this.productRepo = productRepo;
};
GetOrderDetailsUseCase.prototype.execute = function(payload) {
  var o = this.orderRepo.findByOrderId(payload.orderId);
  if (!o || o.firebase_uid !== payload.user.uid) throw new App.AppError("Order not found", 404);

  // Enrich order with product details (The "Join")
  var items = JSON.parse(o.product_details || "[]");
  var self = this;
  var enrichedItems = items.map(function(item) {
    var product = self.productRepo.findByProductId(item.product_id);
    if (product) {
      item.title = product.title;
      item.image_url = product.image_url;
      item.description = product.description;
      item.price_at_order = product.price; // or store this in the order originally
    }
    return item;
  });

  o.items = enrichedItems;
  return { order: o };
};

var GetProductsUseCase = function(productRepo, queryService, utils) {
  this.productRepo = productRepo;
  this.queryService = queryService;
  this.utils = utils;
};
GetProductsUseCase.prototype.execute = function(payload) {
  var raw = this.productRepo.getAll();
  var filtered = this.queryService.query(raw, payload);
  var result = this.utils.paginate(filtered, payload.page, payload.limit);
  return { products: result.items, pagination: result.pagination };
};

var GetCategoriesUseCase = function(categoryRepo) { this.categoryRepo = categoryRepo; };
GetCategoriesUseCase.prototype.execute = function() { return { categories: this.categoryRepo.getAll() }; };

var AddReviewUseCase = function(reviewRepo) { this.reviewRepo = reviewRepo; };
AddReviewUseCase.prototype.execute = function(payload) {
  this.reviewRepo.add({
    product_id: payload.productId,
    order_id: payload.orderId || "",
    review_text: payload.reviewText,
    star_rating: payload.starRating
  });
  return { reviewed: true };
};

var GetCartPreviewUseCase = function(productRepo, couponRepo, utils) {
  this.productRepo = productRepo;
  this.couponRepo = couponRepo;
  this.utils = utils;
};
GetCartPreviewUseCase.prototype.execute = function(payload) {
  var items = payload.items || [];
  var products = [];
  var subtotal = 0;
  var self = this;

  items.forEach(function(item) {
    var p = self.productRepo.findByProductId(item.product_id);
    if (!p) throw new App.AppError("Product not found: " + item.product_id, 404);

    var stock = parseInt(p.stock || 0, 10);
    var preview = {
      product_id: p.product_id,
      title: p.title,
      price: parseFloat(p.price || 0),
      image_url: p.image_url,
      requested_quantity: item.quantity,
      available_stock: stock,
      is_available: stock >= item.quantity
    };

    products.push(preview);
    if (preview.is_available) {
      subtotal += preview.price * item.quantity;
    }
  });

  var discount = 0;
  var couponInfo = null;
  if (payload.couponCode) {
    try {
      var validator = new ValidateCouponUseCase(self.couponRepo);
      var c = validator.execute({ code: payload.couponCode, orderAmount: subtotal });
      if (c.type === App.Constants.COUPON_TYPE.PERCENTAGE) {
        discount = Math.min(subtotal * (c.value / 100), c.maxDiscount);
      } else if (c.type === App.Constants.COUPON_TYPE.FIXED_AMOUNT) {
        discount = Math.min(c.value, subtotal);
      }
      couponInfo = { code: c.code, discount: discount };
    } catch (e) {
      couponInfo = { code: payload.couponCode, error: e.message };
    }
  }

  return {
    items: products,
    subtotal: subtotal,
    discount: discount,
    coupon: couponInfo,
    travel_fee: parseFloat(payload.travelFee || 0),
    total: subtotal - discount + parseFloat(payload.travelFee || 0)
  };
};

var GetReviewsUseCase = function(reviewRepo, orderRepo, utils) {
  this.reviewRepo = reviewRepo;
  this.orderRepo = orderRepo;
  this.utils = utils;
};
GetReviewsUseCase.prototype.execute = function(payload) {
  var reviews = this.reviewRepo.findByProductId(payload.productId);
  var userOrders = [];

  if (payload.user && payload.user.uid) {
    userOrders = this.orderRepo.findByUid(payload.user.uid);
  }

  // Tag Verified Purchases
  reviews.forEach(function(r) {
    r.isVerifiedPurchase = userOrders.some(function(o) {
      var details = JSON.parse(o.product_details || "[]");
      return details.some(function(item) { return item.product_id == r.product_id; });
    });
  });

  var result = this.utils.paginate(reviews, payload.page, payload.limit);
  return { reviews: result.items, pagination: result.pagination };
};

var SearchProductsUseCase = function(productRepo, queryService, utils) {
  this.productRepo = productRepo;
  this.queryService = queryService;
  this.utils = utils;
};
SearchProductsUseCase.prototype.execute = function(payload) {
  var raw = this.productRepo.getAll();
  var filtered = this.queryService.query(raw, payload);
  var result = this.utils.paginate(filtered, payload.page, payload.limit);
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
  this.paymentRepo.add({
    payment_id: id,
    transaction_ref: ref,
    refund_ref: "",
    firebase_uid: payload.user.uid,
    order_id: payload.orderId,
    amount: payload.amount,
    status: "SUCCESS",
    payment_method: method,
    payment_description: desc,
    payer_name: pName,
    payer_email: pEmail,
    payer_phone: pPhone,
    raw_metadata: JSON.stringify(payload.googlePayResponse || payload.metadata || {})
  });

  App.EventDispatcher.dispatch("PAYMENT_COMPLETED", { paymentId: id, orderId: payload.orderId, uid: payload.user.uid, amount: payload.amount });

  return { paymentId: id, status: "SUCCESS", method: method };
};

var RefundPaymentUseCase = function(paymentRepo, utils) {
  this.paymentRepo = paymentRepo;
  this.utils = utils;
};
RefundPaymentUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var p = self.paymentRepo.findById("payment_id", payload.paymentId);
    if (!p) throw new App.AppError("Payment record not found", 404);
    if (p.status === "REFUNDED") throw new App.AppError("Payment already refunded", 400);

    var refundRef = payload.refundRef || "REF-" + Date.now();
    self.paymentRepo.updateRow(p._rowIndex, {
      status: "REFUNDED",
      refund_ref: refundRef,
      updated_at: new Date().toISOString()
    });

    App.EventDispatcher.dispatch("PAYMENT_REFUNDED", { paymentId: payload.paymentId, orderId: p.order_id });
    return { refunded: true, refundRef: refundRef };
  });
};

var UpdateOrderStatusUseCase = function(orderRepo, utils) {
  this.orderRepo = orderRepo;
  this.utils = utils;
};
UpdateOrderStatusUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var o = self.orderRepo.findByOrderId(payload.orderId);
    if (!o) throw new App.AppError("Order not found", 404);

    App.StatusMachine.validateTransition(o.status, payload.status);

    self.orderRepo.updateRow(o._rowIndex, { status: payload.status });

    App.EventDispatcher.dispatch("ORDER_STATUS_UPDATED", { orderId: payload.orderId, status: payload.status });
    return { orderId: payload.orderId, status: payload.status };
  });
};

var GetProfileUseCase = function(profileRepo) {
  this.profileRepo = profileRepo;
};
GetProfileUseCase.prototype.execute = function(payload) {
  var p = this.profileRepo.findByUid(payload.user.uid);
  if (!p) {
    // Return a default profile if not found
    return {
      firebase_uid: payload.user.uid,
      display_name: payload.user.displayName || "User",
      email: payload.user.email || "",
      saved_addresses: "[]",
      preferences: "{}"
    };
  }
  return p;
};

var UpdateProfileUseCase = function(profileRepo, utils) {
  this.profileRepo = profileRepo;
  this.utils = utils;
};

var ToggleWishlistUseCase = function(wishlistRepo, utils) {
  this.wishlistRepo = wishlistRepo;
  this.utils = utils;
};
ToggleWishlistUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var w = self.wishlistRepo.findByUid(payload.user.uid);
    var ids = w ? JSON.parse(w.product_ids || "[]") : [];
    var idx = ids.indexOf(payload.productId);

    if (idx !== -1) {
      ids.splice(idx, 1);
    } else {
      ids.push(payload.productId);
    }

    var data = { firebase_uid: payload.user.uid, product_ids: JSON.stringify(ids), updated_at: new Date().toISOString() };
    if (w) {
      self.wishlistRepo.updateRow(w._rowIndex, data);
    } else {
      self.wishlistRepo.add(data);
    }
    return { wishlist: ids, added: idx === -1 };
  });
};

var GetWishlistUseCase = function(wishlistRepo, productRepo, queryService) {
  this.wishlistRepo = wishlistRepo;
  this.productRepo = productRepo;
  this.queryService = queryService;
};
GetWishlistUseCase.prototype.execute = function(payload) {
  var w = this.wishlistRepo.findByUid(payload.user.uid);
  var ids = w ? JSON.parse(w.product_ids || "[]") : [];
  if (ids.length === 0) return { products: [] };

  var all = this.productRepo.getAll().filter(function(p) { return ids.indexOf(p.product_id) !== -1; });
  // Enrich with current ratings/stock etc via query service
  var enriched = this.queryService.query(all, {});
  return { products: enriched };
};

var GetRelatedProductsUseCase = function(productRepo, queryService) {
  this.productRepo = productRepo;
  this.queryService = queryService;
};
GetRelatedProductsUseCase.prototype.execute = function(payload) {
  var target = this.productRepo.findByProductId(payload.productId);
  if (!target) throw new App.AppError("Product not found", 404);

  var cats = String(target.category_ids || "").split(",");
  var all = this.productRepo.getAll().filter(function(p) {
    if (p.product_id === target.product_id) return false;
    var pCats = String(p.category_ids || "").split(",");
    return pCats.some(function(c) { return cats.indexOf(c) !== -1; });
  });

  var enriched = this.queryService.query(all, { sortBy: "rating_desc" });
  return { products: enriched.slice(0, 10) };
};

UpdateProfileUseCase.prototype.execute = function(payload) {
  var self = this;
  return this.utils.withLock(function() {
    var p = self.profileRepo.findByUid(payload.user.uid);
    var data = {
      display_name: payload.displayName,
      phone_number: payload.phoneNumber,
      saved_addresses: JSON.stringify(payload.savedAddresses || []),
      preferences: JSON.stringify(payload.preferences || {}),
      updated_at: new Date().toISOString()
    };

    if (p) {
      self.profileRepo.updateRow(p._rowIndex, data);
    } else {
      data.firebase_uid = payload.user.uid;
      data.email = payload.user.email;
      self.profileRepo.add(data);
    }
    return { success: true };
  });
};

// Application logic assembly moved to bootstrap.gs
