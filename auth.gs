function handleVerifyFirebaseToken(payload) {
  var authResult = verifyFirebaseToken(payload.idToken);

  if (!authResult.isValid) {
    return jsonError(authResult.error);
  }

  return jsonSuccess(authResult);
}

/**
 * Firebase JWT verification
 */
function verifyFirebaseToken(idToken) {
  try {
    /**
     * ------------------------------------------------
     * BASIC TOKEN CHECK
     * ------------------------------------------------
     */

    if (!idToken || idToken === "guest_session") {
      return {
        isValid: false,
        uid: "guest",
        error: "Guest session",
      };
    }

    var settings = getSettings();

    var FIREBASE_PROJECT_ID = settings.FIREBASE_PROJECT_ID;

    if (!FIREBASE_PROJECT_ID) {
      return {
        isValid: false,
        error: "Missing Firebase project configuration",
      };
    }

    /**
     * ------------------------------------------------
     * JWT STRUCTURE
     * ------------------------------------------------
     */

    var parts = idToken.split(".");

    if (parts.length !== 3) {
      return {
        isValid: false,
        error: "Invalid JWT format",
      };
    }

    /**
     * ------------------------------------------------
     * DECODE HEADER + PAYLOAD
     * ------------------------------------------------
     */

    var header = JSON.parse(decodeJwtPart(parts[0]));

    var decodedPayload = JSON.parse(decodeJwtPart(parts[1]));

    /**
     * ------------------------------------------------
     * HEADER VALIDATION
     * ------------------------------------------------
     */

    if (header.alg !== "RS256") {
      return {
        isValid: false,
        error: "Invalid JWT algorithm",
      };
    }

    /**
     * ------------------------------------------------
     * PAYLOAD VALIDATION
     * ------------------------------------------------
     */

    var expectedIssuer =
      "https://securetoken.google.com/" + FIREBASE_PROJECT_ID;

    if (!decodedPayload.iss || decodedPayload.iss !== expectedIssuer) {
      return {
        isValid: false,
        error: "Invalid issuer",
      };
    }

    if (!decodedPayload.aud || decodedPayload.aud !== FIREBASE_PROJECT_ID) {
      return {
        isValid: false,
        error: "Invalid audience",
      };
    }

    if (!decodedPayload.sub || decodedPayload.sub.length === 0) {
      return {
        isValid: false,
        error: "Invalid subject",
      };
    }

    var now = Math.floor(Date.now() / 1000);

    if (!decodedPayload.exp || decodedPayload.exp < now) {
      return {
        isValid: false,
        error: "Token expired",
      };
    }

    /**
     * ------------------------------------------------
     * CERTIFICATE RESOLUTION
     * ------------------------------------------------
     */

    var certs = getFirebasePublicCertificates();

    var cert = certs[header.kid];

    /**
     * Cert rotation recovery
     */

    if (!cert) {
      certs = getFirebasePublicCertificates(true);

      cert = certs[header.kid];
    }

    if (!cert) {
      return {
        isValid: false,
        error: "Certificate not found",
      };
    }

    /**
     * ------------------------------------------------
     * SIGNATURE VERIFICATION
     * ------------------------------------------------
     */

    var signedContent = parts[0] + "." + parts[1];

    var signatureBytes = Utilities.base64DecodeWebSafe(parts[2]);

    var verified = Utilities.verifyRsaSha256Signature(
      Utilities.newBlob(signedContent).getBytes(),
      signatureBytes,
      cert,
    );

    if (!verified) {
      return {
        isValid: false,
        error: "Invalid signature",
      };
    }

    /**
     * ------------------------------------------------
     * FIREBASE IDENTITY NORMALIZATION
     * ------------------------------------------------
     */

    var firebaseData = decodedPayload.firebase || {};

    var identities = firebaseData.identities || {};

    var linkedAccounts = {};

    Object.keys(identities).forEach(function (provider) {
      linkedAccounts[provider] = {
        accounts: identities[provider] || [],
      };
    });

    /**
     * ------------------------------------------------
     * SUCCESS RESPONSE
     * ------------------------------------------------
     */

    return {
      isValid: true,

      uid: decodedPayload.user_id || decodedPayload.sub || null,

      provider: firebaseData.sign_in_provider || null,

      email: decodedPayload.email || null,

      emailVerified: decodedPayload.email_verified === true,

      phoneNumber: decodedPayload.phone_number || null,

      displayName: decodedPayload.name || null,

      photoUrl: decodedPayload.picture || null,

      issuedAt: decodedPayload.iat || null,

      expiresAt: decodedPayload.exp || null,

      authTime: decodedPayload.auth_time || null,

      issuer: decodedPayload.iss || null,

      audience: decodedPayload.aud || null,

      linkedAccounts: linkedAccounts,

      firebase: firebaseData,

      payload: decodedPayload,
    };
  } catch (err) {
    return {
      isValid: false,
      error: err.toString(),
    };
  }
}
