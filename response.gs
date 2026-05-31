function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function jsonSuccess(data) {
  return respondJson({
    success: true,
    data: data,
  });
}

function jsonError(message) {
  return respondJson({
    success: false,
    error: message,
  });
}
