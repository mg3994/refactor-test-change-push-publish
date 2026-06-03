function handleCreateOrderAction(requestData) {
  var payload = requestData.payload;

  // 1. Validation Check on Request Structure (Outside Lock)
  if (
    !payload ||
    !payload.firebase_uid ||
    !payload.cart ||
    !Array.isArray(payload.cart)
  ) {
    return jsonError(
      "Missing mandatory creation fields: 'firebase_uid' or 'cart' array.",
    );
  }

  // 2. Wrap execution using your custom exponential-backoff lock wrapper
  try {
    return withLockDelayedRetry(function () {
      // A. Fetch current database snapshot inside the lock window
      var productsSheet = getOrCreateSheet("products");
      var productCatalog = getSheetRowsAsJson("products");

      var finalizedItemSnapshots = [];
      var calculatedSubtotal = 0;
      var pendingStockUpdates = [];

      // Validation tracking variables
      var validationErrorMsg = null;
      var errorDetails = null; // Holds structured inventory details for frontend UI tracking

      // B. STEP-BY-STEP VALIDATION LOOP: Check Existence, Status, and Available Stock
      for (var i = 0; i < payload.cart.length; i++) {
        var cartItem = payload.cart[i];
        var requestedQty = parseInt(cartItem.quantity || 0);

        if (requestedQty <= 0) {
          validationErrorMsg =
            "Invalid item quantity requested for Product ID: " +
            cartItem.product_id;
          break;
        }

        // Find matching item row data
        var catalogItem = productCatalog.find(function (item) {
          return String(item.product_id) === String(cartItem.product_id);
        });

        // Verification 1: Does the product exist?
        if (!catalogItem) {
          validationErrorMsg =
            "Transaction Aborted: Product ID '" +
            cartItem.product_id +
            "' no longer exists.";
          break;
        }

        // Verification 2: Is there enough physical inventory?
        var currentStock = parseInt(catalogItem.stock);
        var availableStock = isNaN(currentStock) ? 0 : currentStock;

        if (availableStock < requestedQty) {
          // Dynamic structural user-friendly notification warning
          validationErrorMsg =
            "Sorry, only " +
            availableStock +
            " units of '" +
            catalogItem.title +
            "' are left in stock. Please adjust your cart quantity.";

          errorDetails = {
            product_id: catalogItem.product_id,
            title: catalogItem.title,
            available_stock: availableStock,
            requested_quantity: requestedQty,
          };
          break;
        }

        var frozenPrice = parseFloat(catalogItem.price || 0);
        var itemTotal = frozenPrice * requestedQty;
        calculatedSubtotal += itemTotal;

        // Build the localized immutable order snapshot receipt
        finalizedItemSnapshots.push({
          product_id: catalogItem.product_id,
          title: catalogItem.title,
          description: catalogItem.description,
          price_at_purchase: frozenPrice,
          quantity: requestedQty,
          row_total: itemTotal,
        });

        // Queue coordinates to adjust inventory levels safely once all validations pass
        pendingStockUpdates.push({
          rowIndex: catalogItem._rowIndex,
          newStockValue: availableStock - requestedQty,
        });
      }

      // 🛑 Check if any validation rule failed during the loop execution step
      if (validationErrorMsg !== null) {
        if (errorDetails !== null) {
          return respondJson({
            success: false,
            error: validationErrorMsg,
            details: errorDetails,
          });
        }
        return jsonError(validationErrorMsg);
      }

      // C. DEDUCTION LOOP: Commit new stock values back to the product catalog spreadsheet
      var productHeaders = SHEET_HEADERS.products;
      var stockColumnIndex = productHeaders.indexOf("stock") + 1;

      pendingStockUpdates.forEach(function (update) {
        productsSheet
          .getRange(update.rowIndex, stockColumnIndex)
          .setValue(update.newStockValue);
      });

      // D. PERSIST TO DATABASE: Save matching structure to global SHEET_HEADERS.orders map
      var travelFee = parseFloat(payload.travel_fee || 0);
      var dynamicAbsoluteTotal = calculatedSubtotal + travelFee;
      var ordersSheet = getOrCreateSheet("orders");
      var timestamp = new Date().toISOString();

      // 💡 INTEGRATED YOUR NATIVE UNIQUE ID WRAPPER ENGINE HERE
      var uniqueOrderId = generateUniqueId("ORD");

      var orderRowData = [
        uniqueOrderId,
        payload.firebase_uid,
        JSON.stringify(finalizedItemSnapshots),
        dynamicAbsoluteTotal,
        travelFee,
        ORDER_STATUS.PENDING,
        payload.shipping_phone || "",
        payload.full_address || "",
        payload.latitude || "",
        payload.longitude || "",
        payload.customer_note || "",
        timestamp, // created_at
        timestamp, // updated_at
      ];

      ordersSheet.appendRow(orderRowData);

      // Return successful response package back up through callback closure
      return jsonSuccess({
        order_id: uniqueOrderId,
        status: ORDER_STATUS.PENDING,
        total_charged: dynamicAbsoluteTotal,
        items_count: finalizedItemSnapshots.length,
      });
    });
  } catch (err) {
    return jsonError(err.message || err.toString());
  }
}

///////////////////

function handleCancelOrderAction(requestData) {
  var payload = requestData.payload;

  // 1. Structural Validation Check (Outside Lock)
  if (!payload || !payload.order_id) {
    return jsonError("Missing required payload parameter: 'order_id'.");
  }

  // 2. Execute inside your exclusive delayed retry lock wrapper
  try {
    return withLockDelayedRetry(function () {
      var ordersSheet = getOrCreateSheet("orders");
      var rowsData = getSheetRowsAsJson("orders");

      // Find the targeted order inside your sheet database matrix
      var targetOrder = rowsData.find(function (row) {
        return row.order_id === payload.order_id;
      });

      if (!targetOrder) {
        return jsonError(
          "Order matching ID '" + payload.order_id + "' could not be found.",
        );
      }

      // 💡 GUARD A: Execute the abstraction state check exclusion rule
      if (!isOrderCancellable(targetOrder.status)) {
        return jsonError(
          "Cancellation denied: This order is already '" +
            targetOrder.status +
            "' and cannot be modified.",
        );
      }

      // 3. REPLENISHMENT PHASE: Parse the historical frozen cart snapshot
      var orderItemsSnapshot = [];
      try {
        orderItemsSnapshot = JSON.parse(targetOrder.product_details || "[]");
      } catch (parseError) {
        return jsonError(
          "Database Error: Failed to parse historical items metadata for snapshot restoration.",
        );
      }

      var productsSheet = getOrCreateSheet("products");
      var productCatalog = getSheetRowsAsJson("products");
      var pendingStockUpdates = [];
      var validationErrorMsg = null;

      // Match snapshot items back against current live products to prepare addition
      for (var i = 0; i < orderItemsSnapshot.length; i++) {
        var snappedItem = orderItemsSnapshot[i];
        var quantityToRestore = parseInt(snappedItem.quantity || 0);

        var catalogItem = productCatalog.find(function (item) {
          return String(item.product_id) === String(snappedItem.product_id);
        });

        // Guard: In case a product was completely deleted from your store catalog while the order was active
        if (!catalogItem) {
          validationErrorMsg =
            "Restoration Warning: Product ID '" +
            snappedItem.product_id +
            "' was deleted from catalog. Cannot adjust inventory.";
          break;
        }

        var currentStock = parseInt(catalogItem.stock);
        var baseStock = isNaN(currentStock) ? 0 : currentStock;

        pendingStockUpdates.push({
          rowIndex: catalogItem._rowIndex,
          newStockValue: baseStock + quantityToRestore, // 💡 Incrementing inventory back to active pool
        });
      }

      // If a major issue occurred during catalog matching, exit before doing any sheet writes
      if (validationErrorMsg !== null) {
        return jsonError(validationErrorMsg);
      }

      // 4. WRITE UPDATES BACK TO THE SPREADSHEETS

      // A. Commit new replenished stock values back to the products catalog sheet
      var productHeaders = SHEET_HEADERS.products;
      var stockColumnIndex = productHeaders.indexOf("stock") + 1;

      pendingStockUpdates.forEach(function (update) {
        productsSheet
          .getRange(update.rowIndex, stockColumnIndex)
          .setValue(update.newStockValue);
      });

      // B. Change status properties cleanly inside the target orders row cell matrix
      var orderHeaders = SHEET_HEADERS.orders;
      var statusColIndex = orderHeaders.indexOf("status") + 1;
      var updatedColIndex = orderHeaders.indexOf("updated_at") + 1;
      var timestamp = new Date().toISOString();

      ordersSheet
        .getRange(targetOrder._rowIndex, statusColIndex)
        .setValue(ORDER_STATUS.CANCELLED);
      ordersSheet
        .getRange(targetOrder._rowIndex, updatedColIndex)
        .setValue(timestamp);

      // Return unified execution data payload down through callback loop context
      return jsonSuccess({
        order_id: payload.order_id,
        status: ORDER_STATUS.CANCELLED,
        message:
          "Order cancelled successfully. Quantities have been safely returned to live catalog stock inventory.",
      });
    }); // 5 attempts default via withLockDelayedRetry wrapper
  } catch (err) {
    return jsonError(err.message || err.toString());
  }
}
