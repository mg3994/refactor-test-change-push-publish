var ORDER_STATUS = {
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
  DELIVERED: "DELIVERED",
};

var ACTIONS = {
  // Authentication & Notification Actions
  VERIFY_TOKEN: "verifyFirebaseToken",
  SEND_NOTIFICATION: "sendFcmNotification",
  BROADCAST_NOTIFICATION: "broadcastFcmNotification",

  // ... your other actions
  GET_NOTIFICATIONS: "get_notifications",

  // Device Synchronization State Actions
  SYNC_DEVICE: "SYNC_DEVICE",
  LOGOUT_DEVICE: "LOGOUT_DEVICE", // Added missing action key

  // Added Map Engine API Actions
  GET_PLACE_SUGGESTIONS: "getPlaceSuggestions",
  PROCESS_LOCATION_METRICS: "processLocationMetrics",
  PROCESS_PIN_DROP_METRICS: "processPinDropMetrics",

  // New Logistics Radius Action
  VERIFY_LOGISTICS: "verifyLogistics",

  // Order Management Actions

  CREATE_ORDER: "CREATE_ORDER",
  CANCEL_ORDER: "CANCEL_ORDER",

  // eCommerce Actions
  GET_PRODUCTS: "GET_PRODUCTS",
  GET_CATEGORIES: "GET_CATEGORIES",
  ADD_REVIEW: "ADD_REVIEW",
  GET_REVIEWS: "GET_REVIEWS",
  PROCESS_PAYMENT: "PROCESS_PAYMENT",
  SEARCH_PRODUCTS: "SEARCH_PRODUCTS",
};

var SHEET_HEADERS = {
  sessions: [
    "client_id",
    "firebase_uid",
    "fcm_token",
    "client_name",
    "last_synced",
  ],
  payments: [
    "payment_id",
    "transaction_ref",
    "refund_ref",
    "firebase_uid",
    "order_id",
    "amount",
    "status",
    "payment_method",
    "payment_description",
    "raw_metadata",
    "created_at",
  ],
  orders: [
    "order_id",
    "firebase_uid",
    "product_details",
    "total_amount",
    "travel_fee",
    "status",
    "shipping_phone",
    "full_address",
    "latitude",
    "longitude",
    "customer_note",
    "created_at",
    "updated_at",
  ],
  categories: ["category_id", "title", "description", "created_at"],
  products: [
    "product_id",
    "title",
    "description",
    "price",
    "image_url",
    "stock",
    "category_ids",
    "created_at",
  ],
  reviews: [
    "product_id",
    "order_id",
    "review_text",
    "star_rating",
    "created_at",
  ],
  notifications: [
    "notification_id",
    "firebase_uid",
    "title",
    "body",
    "click_url",
    "status",
    "created_at",
  ],
};
