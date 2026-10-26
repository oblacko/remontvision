import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RENDER_MODEL = 'test/model';

const { generateRender, parseRender, snapAspect } = await import('../src/openrouter.js');

const SOURCE = 'data:image/jpeg;base64,SOURCE';
const REF = 'data:image/png;base64,REF';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('source image is the first input_reference in the main /images payload', async () => {
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return json({ data: [{ b64_json: 'abc' }] });
  };

  const out = await generateRender({
    prompt: 'test',
    sourceImageB64: SOURCE,
    referenceImagesB64: [REF],
    aspectRatio: '1:4',
  });

  assert.equal(captured.url, 'https://openrouter.ai/api/v1/images');
  assert.equal(captured.body.aspect_ratio, '1:4');
  assert.equal(captured.body.input_references[0].image_url.url, SOURCE);
  assert.equal(captured.body.input_references[1].image_url.url, REF);
  assert.equal(out.b64, 'abc');
});

test('render never makes more than two external calls', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return json({ error: 'provider down' }, 500);
  };

  await assert.rejects(() => generateRender({ prompt: 'test', sourceImageB64: SOURCE }));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].endsWith('/images'));
  assert.ok(calls[1].endsWith('/chat/completions'));
});

test('known costs from both attempts are summed', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return json({ usage: { cost: 0.01 } }); // ответ без картинки, но оплачен
    return json({ data: [{ b64_json: 'abc' }], usage: { cost: 0.02 } });
  };

  const out = await generateRender({ prompt: 'test', sourceImageB64: SOURCE });
  assert.equal(calls, 2);
  assert.equal(out.cost, 0.03);
});

test('vision receives the real image MIME', async () => {
  let body;
  globalThis.fetch = async (_url, opts) => {
    body = JSON.parse(opts.body);
    return json({ choices: [{ message: { content: '[]' } }] });
  };

  await parseRender('abc', 'image/jpeg');
  assert.match(body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

test('portrait source keeps a portrait aspect request', () => {
  assert.equal(snapAspect(583, 1280), '9:16');
  assert.equal(snapAspect(1536, 1024), '3:2');
});
