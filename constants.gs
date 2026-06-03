var ORDER_STATUS = {
  // 1. Initial Flow
  PENDING: "PENDING",
  PLACED: "PLACED",

  // 2. Warehouse/Fulfillment Phase (New)
  PROCESSING: "PROCESSING",

  // 3. Logistics Phase
  ASSIGNED: "ASSIGNED",
  IN_TRANSIT: "IN_TRANSIT",

  // 4. Delivery Exceptions (New)
  FAILED_ATTEMPT: "FAILED_ATTEMPT",

  // 5. Final Success
  DELIVERED: "DELIVERED",

  // 6. Cancellations & Returns (Expanded)
  CANCELLED: "CANCELLED",
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
  REFUNDED: "REFUNDED",
};

// Abstraction Array: Grouping the final states where cancellation is impossible
var NON_CANCELLABLE_STATUSES = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.REFUNDED,
  ORDER_STATUS.CANCELLED, // Added this so you can't cancel an already cancelled order
];

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

  // New Payment Action
  RECORD_PAYMENT: "RECORD_PAYMENT"
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
    "category_ids", // ultiple categories can be comma-separated
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
