import admin from 'firebase-admin';
import logger from '../config/logger.js';

let firebaseReady = false;

export const initFirebase = () => {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson || serviceAccountJson === 'replace_me') {
    logger.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled.');
    return;
  }
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    firebaseReady = true;
    logger.info('✅ Firebase Admin initialized — push notifications ready');
  } catch (err) {
    logger.error(`❌ Firebase init failed: ${err.message}`);
  }
};

/**
 * Send push notification to one or more FCM tokens.
 * Never throws — push failures should not block the main flow.
 *
 * @param {string|string[]} tokens   FCM device token(s)
 * @param {object}          payload  { title, body, data }
 */
export const sendPush = async (tokens, { title, body, data = {} }) => {
  if (!firebaseReady) return;
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  const valid = tokenList.filter(Boolean);
  if (!valid.length) return;

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority:     'high',
        notification: { sound: 'default', channelId: 'addis-bright' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    if (valid.length === 1) {
      await admin.messaging().send({ ...message, token: valid[0] });
      logger.debug(`📱 Push sent to 1 device`);
    } else {
      const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: valid });
      logger.debug(`📱 Push sent: ${response.successCount}/${valid.length} delivered`);
    }
  } catch (err) {
    logger.error(`Push notification error: ${err.message}`);
  }
};

export const isFirebaseReady = () => firebaseReady;
