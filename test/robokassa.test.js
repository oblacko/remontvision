import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const {
  paymentSignature,
  resultSignature,
  amountToKopecks,
  parseOpState,
  buildRefundToken,
  buildPaymentUrl,
  safeEqual,
} = await import('../src/robokassa.js');

const config = {
  login: 'demo',
  password1: 'password_1',
  password2: 'password_2',
  password3: 'password_3',
  hash: 'md5',
  test: true,
  culture: 'ru',
  paymentMethod: '',
  noFreeSale: false,
};

test('payment signature matches Robokassa formula', () => {
  assert.equal(
    paymentSignature({ login: 'demo', outSum: '990.00', invId: 12, password1: 'password_1' }),
    '6c9d6eb96b82e643b343c26a85349a37',
  );
});

test('result signature includes sorted Shp parameters', () => {
  assert.equal(
    resultSignature({
      outSum: '100.000000',
      invId: '450009',
      password2: 'password_2',
      params: { Shp_oplata: '1', Shp_login: 'Vasya' },
    }),
    '4adcef23deded52faef69a96efdf67e8',
  );
});

test('amounts are converted between rubles and kopecks', () => {
  assert.equal(amountToKopecks('990.00'), 99000);
  assert.equal(amountToKopecks('100.000000'), 10000);
  assert.equal(amountToKopecks('12,34'), 1234);
  assert.equal(amountToKopecks('nope'), null);
});

test('payment URL carries test flag and signed fields', () => {
  const url = new URL(buildPaymentUrl({
    invId: 42,
    amountKopecks: 9900,
    description: 'ремонтвижн: 2 кредита',
    email: 'user@example.com',
    config,
  }));
  assert.equal(url.searchParams.get('MerchantLogin'), 'demo');
  assert.equal(url.searchParams.get('OutSum'), '99.00');
  assert.equal(url.searchParams.get('InvId'), '42');
  assert.equal(url.searchParams.get('IsTest'), '1');
  assert.equal(url.searchParams.get('Email'), 'user@example.com');
  assert.equal(url.searchParams.get('SignatureValue'), paymentSignature({
    login: 'demo', outSum: '99.00', invId: 42, password1: 'password_1',
  }));
});

test('OpStateExt XML is parsed without external dependencies', () => {
  const xml = `<OperationStateResponse><Result><Code>0</Code></Result>
    <State><Code>100</Code></State>
    <Info><OutSum>99.000000</OutSum><OpKey>ABC-123</OpKey></Info></OperationStateResponse>`;
  assert.deepEqual(parseOpState(xml), {
    resultCode: 0,
    stateCode: 100,
    opKey: 'ABC-123',
    outSum: '99.000000',
  });
});

test('refund token is a compact HS256 JWT with OpKey', () => {
  const token = buildRefundToken({ opKey: 'ABC-123', amountKopecks: 9900, password3: 'password_3' });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), { OpKey: 'ABC-123', RefundSum: 99 });
  const expected = crypto.createHmac('sha256', 'password_3').update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected);
});

test('signature comparison is case-insensitive and length-safe', () => {
  assert.equal(safeEqual('ABCDEF', 'abcdef'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', 'abc'), false);
});
