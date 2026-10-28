import crypto from 'node:crypto';

const PAYMENT_URL = process.env.ROBOKASSA_PAYMENT_URL || 'https://auth.robokassa.ru/Merchant/Index.aspx';
const REFUND_URL = process.env.ROBOKASSA_REFUND_URL || 'https://services.robokassa.ru/RefundService/Refund/Create';
const STATE_URL = process.env.ROBOKASSA_STATE_URL || 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';

export function getConfig() {
  return {
    login: process.env.ROBOKASSA_LOGIN || '',
    password1: process.env.ROBOKASSA_PASSWORD_1 || '',
    password2: process.env.ROBOKASSA_PASSWORD_2 || '',
    password3: process.env.ROBOKASSA_PASSWORD_3 || '',
    hash: (process.env.ROBOKASSA_HASH_ALGO || 'md5').toLowerCase(),
    test: /^(1|true|yes)$/i.test(process.env.ROBOKASSA_TEST || ''),
    culture: process.env.ROBOKASSA_CULTURE || 'ru',
    paymentMethod: process.env.ROBOKASSA_PAYMENT_METHOD || '',
    noFreeSale: /^(1|true|yes)$/i.test(process.env.ROBOKASSA_NO_FREE_SALE || ''),
    receiptEnabled: !/^(0|false|no)$/i.test(process.env.ROBOKASSA_RECEIPT_ENABLED || ''),
  };
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.login && c.password1 && c.password2);
}

export function hashValue(value, algo = 'md5') {
  return crypto.createHash(algo).update(value, 'utf8').digest('hex');
}

export function shpEntries(params = {}) {
  return Object.entries(params)
    .filter(([key]) => /^Shp_/i.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function shpSuffix(params = {}) {
  const entries = shpEntries(params);
  return entries.length ? ':' + entries.map(([key, value]) => `${key}=${value}`).join(':') : '';
}

export function encodeReceipt(receipt) {
  const json = typeof receipt === 'string' ? receipt : JSON.stringify(receipt);
  return new URLSearchParams({ Receipt: json }).toString().slice('Receipt='.length);
}

export function paymentSignature({ login, outSum, invId, password1, hash = 'md5', params = {}, receipt = null }) {
  const encodedReceipt = receipt ? encodeReceipt(receipt) : null;
  const receiptPart = encodedReceipt ? `:${encodedReceipt}` : '';
  return hashValue(`${login}:${outSum}:${invId}${receiptPart}:${password1}${shpSuffix(params)}`, hash);
}

export function resultSignature({ outSum, invId, password2, hash = 'md5', params = {} }) {
  return hashValue(`${outSum}:${invId}:${password2}${shpSuffix(params)}`, hash);
}

export function successSignature({ outSum, invId, password1, hash = 'md5', params = {} }) {
  return hashValue(`${outSum}:${invId}:${password1}${shpSuffix(params)}`, hash);
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || '').toLowerCase(), 'utf8');
  const b = Buffer.from(String(right || '').toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function amountToKopecks(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function kopecksToOutSum(kopecks) {
  return (Number(kopecks) / 100).toFixed(2);
}

export function buildPaymentUrl({ invId, amountKopecks, description, email = null, receipt = null, config = getConfig() }) {
  const outSum = kopecksToOutSum(amountKopecks);
  const receiptJson = config.receiptEnabled && receipt ? JSON.stringify(receipt) : null;
  const encodedReceipt = receiptJson ? encodeReceipt(receiptJson) : null;
  const signature = paymentSignature({
    login: config.login,
    outSum,
    invId,
    password1: config.password1,
    hash: config.hash,
    receipt: receiptJson,
  });
  const query = new URLSearchParams({
    MerchantLogin: config.login,
    OutSum: outSum,
    InvId: String(invId),
    Description: String(description || '').slice(0, 100),
    SignatureValue: signature,
    Encoding: 'utf-8',
    Culture: config.culture,
  });
  if (encodedReceipt) query.set('Receipt', encodedReceipt);
  if (email) query.set('Email', email);
  if (config.paymentMethod) query.set('IncCurrLabel', config.paymentMethod);
  if (config.test) query.set('IsTest', '1');
  if (config.noFreeSale) query.set('IsWithoutFreeSale', '1');
  return `${PAYMENT_URL}?${query.toString()}`;
}

export function verifyResult(params, config = getConfig()) {
  const outSum = String(params.OutSum ?? params.outSum ?? '');
  const rawInvId = params.InvId ?? params.InvID ?? params.invId ?? '';
  const invId = String(rawInvId);
  const expected = resultSignature({
    outSum,
    invId,
    password2: config.password2,
    hash: config.hash,
    params,
  });
  return {
    ok: Boolean(outSum && invId && safeEqual(params.SignatureValue, expected)),
    invId,
    outSum,
    amountKopecks: amountToKopecks(outSum),
  };
}

export function parseOpState(xml) {
  const pick = (tag) => {
    const match = String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    return match ? match[1].trim() : null;
  };
  const resultCode = pick('Code');
  const stateBlock = String(xml || '').match(/<State>([\s\S]*?)<\/State>/i)?.[1] || '';
  const stateCode = stateBlock.match(/<Code>([\s\S]*?)<\/Code>/i)?.[1]?.trim() || null;
  return {
    resultCode: resultCode === null ? null : Number(resultCode),
    stateCode: stateCode === null ? null : Number(stateCode),
    opKey: pick('OpKey'),
    outSum: pick('OutSum'),
  };
}

export async function fetchOpState(invId, { dispatcher = undefined, config = getConfig() } = {}) {
  if (config.test) return null;
  const signature = hashValue(`${config.login}:${invId}:${config.password2}`, config.hash);
  const url = `${STATE_URL}?${new URLSearchParams({
    MerchantLogin: config.login,
    InvoiceID: String(invId),
    Signature: signature,
  })}`;
  const response = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(15_000),
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`robokassa state ${response.status}: ${xml.slice(0, 200)}`);
  return parseOpState(xml);
}

export function buildRefundToken({ opKey, amountKopecks, password3, algo = 'HS256' }) {
  const header = { alg: algo, typ: 'JWT' };
  const payload = { OpKey: opKey, RefundSum: Number((Number(amountKopecks) / 100).toFixed(2)) };
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const data = `${encode(header)}.${encode(payload)}`;
  const digest = algo === 'HS384' ? 'sha384' : algo === 'HS512' ? 'sha512' : 'sha256';
  const signature = crypto.createHmac(digest, password3).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export async function createRefundRequest({ payment, amountKopecks, config = getConfig(), dispatcher = undefined }) {
  if (!config.password3) throw new Error('Robokassa: не задан ROBOKASSA_PASSWORD_3 для возвратов');
  const opKey = payment.payload?.robokassa_op_key;
  if (!opKey) throw new Error('Robokassa: нет OpKey платежа — возврат недоступен автоматически');
  const token = buildRefundToken({ opKey, amountKopecks, password3: config.password3 });
  const response = await fetch(REFUND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
    body: token,
    dispatcher,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) {
    throw new Error(`robokassa refund ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return {
    id: data.requestId || null,
    status: 'pending',
    payload: data,
  };
}
