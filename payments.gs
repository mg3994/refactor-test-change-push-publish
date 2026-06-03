/**
 * Securely records a payment after cryptographic validation of the Firebase ID token.
 * Wrapped inside a dynamic concurrency lock to guarantee transactional database integrity.
 * * Expects payload: {
 * action: "RECORD_PAYMENT",
 * idToken: "eyJhbGciOi...",
 * order_id: "...",
 * payment_id: "...",
 * transaction_ref: "...",
 * amount: 123.45,
 * raw_metadata: "{...}"
 * }
 */
function handleRecordPaymentAction(payload) {
  // 1. Structural Input Check
  if (!payload.idToken || !payload.order_id) {
    return jsonError(
      "Security block: Missing idToken or order_id validation frames.",
    );
  }

  // 2. Cryptographic Token Verification (Run outside the lock to keep lock duration short)
  var authResult = verifyFirebaseToken(payload.idToken);
  if (!authResult.isValid) {
    return jsonError("Authentication failed: " + authResult.error);
  }

  var secureFirebaseUid = authResult.uid;
  var orderId = payload.order_id;

  // 3. Execute database checks and writes within the exclusive script lock engine
  try {
    return withLockDelayedRetry(function () {
      // --- DB PHASE A: VERIFY ORDER EXISTENCE ---
      var ordersSheet = getOrCreateSheet("orders");
      var ordersRows = getSheetRowsAsJson("orders");

      var targetOrder = null;
      for (var i = 0; i < ordersRows.length; i++) {
        if (ordersRows[i].order_id === orderId) {
          targetOrder = ordersRows[i];
          break;
        }
      }

      // Guard Clause 1: Check if order exists
      if (!targetOrder) {
        return jsonError(
          "Order error: Order ID '" + orderId + "' does not exist.",
        );
      }

      // Guard Clause 2: Cross-check token identity against order owner
      if (targetOrder.firebase_uid !== secureFirebaseUid) {
        return jsonError(
          "Security Violation: Authenticated user identity mismatch.",
        );
      }

      // --- DB PHASE B: IDEMPOTENCY CHECK (PREVENT DOUBLE PAYMENTS) ---
      var paymentsRows = getSheetRowsAsJson("payments");
      for (var j = 0; j < paymentsRows.length; j++) {
        // Stop execution if a valid successful payment row matches this order
        if (
          paymentsRows[j].order_id === orderId &&
          paymentsRows[j].status === "SUCCESS"
        ) {
          return jsonError(
            "Transaction Aborted: Order ID '" +
              orderId +
              "' has already been processed and paid.",
          );
        }
      }

      // --- DB PHASE C: UPDATE ORDER STATUS ---
      var statusColIndex = SHEET_HEADERS.orders.indexOf("status") + 1;
      var updatedAtColIndex = SHEET_HEADERS.orders.indexOf("updated_at") + 1;

      if (statusColIndex > 0) {
        ordersSheet
          .getRange(targetOrder._rowIndex, statusColIndex)
          .setValue(ORDER_STATUS.PLACED);
      }
      if (updatedAtColIndex > 0) {
        ordersSheet
          .getRange(targetOrder._rowIndex, updatedAtColIndex)
          .setValue(new Date());
      }

      // --- DB PHASE D: RECORD ENTRY TO PAYMENTS LEDGER ---
      var paymentsSheet = getOrCreateSheet("payments");
      var headers = SHEET_HEADERS.payments;

      var paymentDataMap = {
        payment_id:
          payload.payment_id || "PAY_" + generateUniqueId("PAY").split("-")[2],
        transaction_ref: payload.transaction_ref || "TXN_REF_MISSING",
        refund_ref: "",
        firebase_uid: secureFirebaseUid,
        order_id: orderId,
        amount: payload.amount || targetOrder.total_amount,
        status: "SUCCESS",
        raw_metadata:
          typeof payload.raw_metadata === "object"
            ? JSON.stringify(payload.raw_metadata)
            : payload.raw_metadata || "{}",
        created_at: new Date(),
      };

      var paymentRowData = [];
      for (var k = 0; k < headers.length; k++) {
        paymentRowData.push(paymentDataMap[headers[k]]);
      }

      paymentsSheet.appendRow(paymentRowData);

      // Return successful response context
      return jsonSuccess({
        message:
          "Payment verified, processed, and recorded safely under transactional lock.",
        order_id: orderId,
        payment_id: paymentDataMap.payment_id,
        status: ORDER_STATUS.PLACED,
      });
    }, 5); // Fallback queue limits set to 5 operational retry blocks
  } catch (lockError) {
    // Gracefully handle case where Script Lock queue is completely full
    return jsonError("Database Mutex Error: " + lockError.toString());
  }
}
