/**
 * Action: sendFcmNotification
 * Expects payload: { tokens: [...], title: "...", body: "...", data: {} }
 */
function handleSendFcmNotification(payload) {
  if (
    !payload.tokens ||
    !Array.isArray(payload.tokens) ||
    payload.tokens.length === 0
  ) {
    return jsonError("Missing target device tokens array.");
  }
  if (!payload.title || !payload.body) {
    return jsonError("Missing notification title or body components.");
  }

  try {
    var executionMap = sendFcmMulticast(
      payload.tokens,
      payload.title,
      payload.body,
      payload.data || null,
    );

    var successes = executionMap.filter(function (r) {
      return r.success;
    }).length;
    var failures = executionMap.length - successes;

    return jsonSuccess({
      totalProcessed: executionMap.length,
      successCount: successes,
      failureCount: failures,
      details: executionMap,
    });
  } catch (err) {
    return jsonError("FCM Execution Thread Error: " + err.toString());
  }
}

/**
 * Action: broadcastFcmNotification
 * Casts a message to an FCM "Topic" (ideal for targeting everyone at once)
 */
function handleBroadcastFcmNotification(payload) {
  var settings = getSettings();
  if (settings.NOTIFICATIONS_ENABLED === "false") {
    return jsonError("Notifications globally disabled.");
  }

  var targetTopic = payload.topic || "all_users";
  var accessToken = getFcmAccessToken();
  var url =
    "https://fcm.googleapis.com/v1/projects/" +
    settings.FIREBASE_PROJECT_ID +
    "/messages:send";

  var messagePayload = {
    message: {
      topic: targetTopic,
      notification: {
        title: payload.title,
        body: payload.body,
      },
    },
  };

  if (payload.data) messagePayload.message.data = payload.data;

  try {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + accessToken },
      payload: JSON.stringify(messagePayload),
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() === 200) {
      return jsonSuccess({
        topic: targetTopic,
        messageId: JSON.parse(res.getContentText()).name,
      });
    } else {
      return jsonError("Topic broadcast failed: " + res.getContentText());
    }
  } catch (err) {
    return jsonError(err.toString());
  }
}

/**
 * Sends a notification payload to an array of device tokens in parallel batches
 */
function sendFcmMulticast(tokens, title, body, extraData) {
  var settings = getSettings();
  if (settings.NOTIFICATIONS_ENABLED === "false") {
    return { success: false, error: "Notifications are globally disabled" };
  }

  var projectId = settings.FIREBASE_PROJECT_ID;
  var url =
    "https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send";
  var accessToken = getFcmAccessToken();

  var requests = tokens.map(function (token) {
    var messagePayload = {
      message: {
        token: token,
        notification: {
          title: title,
          body: body,
        },
      },
    };

    if (extraData) {
      messagePayload.message.data = extraData;
    }

    return {
      url: url,
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + accessToken },
      payload: JSON.stringify(messagePayload),
      muteHttpExceptions: true,
    };
  });

  // Split into execution chunks of 40 parallel requests to prevent App Script limit overheads
  var batchSize = 40;
  var results = [];

  for (var i = 0; i < requests.length; i += batchSize) {
    var chunk = requests.slice(i, i + batchSize);
    var responses = UrlFetchApp.fetchAll(chunk);

    responses.forEach(function (res, idx) {
      var status = res.getResponseCode();
      results.push({
        token: tokens[i + idx],
        success: status === 200,
        response: res.getContentText(),
      });
    });
  }

  return results;
}

/**
 * Action Handler: get_notifications
 * Supports filtering by 'status' and pagination via 'page' and 'limit' parameters.
 */
function handleGetNotifications(payload, e) {
  try {
    // 1. Resolve parameters from either POST body payload or fallback URL query parameter inputs
    var idToken =
      payload.idToken || (e && e.parameter ? e.parameter.idToken : null);
    var statusFilter =
      payload.status || (e && e.parameter ? e.parameter.status : null);

    var page = parseInt(
      payload.page || (e && e.parameter ? e.parameter.page : 1),
      10,
    );
    var limit = parseInt(
      payload.limit || (e && e.parameter ? e.parameter.limit : 10),
      10,
    );

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    if (!idToken) {
      return jsonError("Missing required parameter: idToken");
    }

    // 2. Validate session footprint securely against Firebase Auth Token Rules
    var authResult = verifyFirebaseToken(idToken);
    if (
      !authResult ||
      (authResult.isValid !== undefined && !authResult.isValid)
    ) {
      return jsonError("Unauthorized session lifecycle confirmation.");
    }

    var targetUid = authResult.uid;

    // 3. Extract sheet rows data streams from the system database
    var rows = getSheetRowsAsJson("notifications"); // Resolves object headers array maps automatically

    // 4. STEP A: Filter strictly by ownership footprint mapping
    var filteredData = rows.filter(function (r) {
      return String(r.firebase_uid) === String(targetUid);
    });

    // 5. STEP B: Apply optional structural category filtering (e.g., 'read', 'unread', 'pending')
    if (statusFilter) {
      filteredData = filteredData.filter(function (r) {
        return (
          String(r.status).trim().toLowerCase() ===
          String(statusFilter).trim().toLowerCase()
        );
      });
    }

    // 6. STEP C: Apply sorting architecture (Newest notifications first based on created_at string values)
    filteredData.sort(function (a, b) {
      var timeB = a.created_at ? new Date(b.created_at).getTime() : 0;
      var timeA = b.created_at ? new Date(a.created_at).getTime() : 0;
      return timeB - timeA;
    });

    // 7. STEP D: Compute offset ranges matrices maps for execution splits
    var totalRecords = filteredData.length;
    var totalPages = Math.ceil(totalRecords / limit);
    var startIndex = (page - 1) * limit;
    var endIndex = startIndex + limit;

    // Slice array limits to isolate single targeted data response frame page
    var paginatedRows = filteredData.slice(startIndex, endIndex);

    // 8. Map database row references explicitly clean to preserve sheet structures array contract safely
    var records = paginatedRows.map(function (r) {
      return {
        notification_id: r.notification_id || "",
        firebase_uid: r.firebase_uid || "",
        title: r.title || "",
        body: r.body || "",
        click_url: r.click_url || "",
        status: r.status || "",
        created_at: r.created_at || "",
      };
    });

    // 9. Respond with rich operational metadata summaries alongside payload elements array data frame
    return jsonSuccess({
      notifications: records,
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        limit_per_page: limit,
        has_next_page: page < totalPages,
        has_previous_page: page > 1,
      },
    });
  } catch (err) {
    return jsonError(
      "Notifications Engine Processing Failure: " + err.toString(),
    );
  }
}
