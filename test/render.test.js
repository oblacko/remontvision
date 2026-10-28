import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RENDER_MODEL = 'test/model';

const { generateRender, assessProductEdit, parseRender, snapAspect } = await import('../src/openrouter.js');
const { supportsResolution } = await import('../src/modelcaps.js');

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

test('product QA compares parent, edit and product and accepts only all checks', async () => {
  let body;
  globalThis.fetch = async (_url, opts) => {
    body = JSON.parse(opts.body);
    return json({
      choices: [{ message: { content: JSON.stringify({
        architecture_preserved: true,
        product_match: true,
        no_artifacts: true,
        quality_not_worse: true,
        issues: [],
      }) } }],
      usage: { cost: 0.01 },
    });
  };

  const out = await assessProductEdit({
    parentImageUrl: SOURCE,
    editedImageUrl: REF,
    productImageUrl: 'data:image/webp;base64,PRODUCT',
    productName: 'Диван',
    target: 'sofa',
  });
  const images = body.messages[1].content.filter(part => part.type === 'image_url');
  assert.equal(images.length, 3);
  assert.equal(images[0].image_url.url, SOURCE);
  assert.equal(images[1].image_url.url, REF);
  assert.equal(out.accepted, true);
  assert.equal(out.status, 'accepted');
  assert.equal(out.cost, 0.01);
});

test('product QA rejects when visual quality gets worse', async () => {
  globalThis.fetch = async () => json({ choices: [{ message: { content: JSON.stringify({
    architecture_preserved: true,
    product_match: true,
    no_artifacts: true,
    quality_not_worse: false,
    issues: ['Свет стал плоским'],
  }) } }] });

  const out = await assessProductEdit({ parentImageUrl: SOURCE, editedImageUrl: REF, productImageUrl: REF });
  assert.equal(out.accepted, false);
  assert.equal(out.status, 'rejected');
  assert.deepEqual(out.issues, ['Свет стал плоским']);
});

test('FLUX does not receive resolution, Seedream does', () => {
  assert.equal(supportsResolution('black-forest-labs/flux.2-pro'), false);
  assert.equal(supportsResolution('bytedance-seed/seedream-5-0-flash'), true);
  assert.equal(supportsResolution('google/gemini-3.1-flash-image-preview'), false);
});

test('portrait source keeps a portrait aspect request', () => {
  assert.equal(snapAspect(583, 1280), '9:16');
  assert.equal(snapAspect(1536, 1024), '3:2');
});
