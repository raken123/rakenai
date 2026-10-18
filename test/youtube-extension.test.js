import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// gif-core.js is a plain content script; run it in a sandbox to get its exports.
const sandbox = { URL };
vm.runInNewContext(readFileSync(new URL('../youtube-extension/content/gif-core.js', import.meta.url), 'utf8'), sandbox);
const G = sandbox.YTPGifCore;

test('GIF tokens in comment text become GIPHY image URLs', () => {
  assert.deepEqual(
    [...G.gifsInText('lol [gif:111ebonMs90YLu] and [gif:10JhviFuU2gWD6]')],
    ['https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif'],
  );
  assert.equal(G.stripTokens('so true [gif:111ebonMs90YLu] haha'), 'so true  haha');
  assert.equal(G.gifsInText('[gif:<script>]').length, 0);
});

test('GIF links are recognised, including through YouTube redirects', () => {
  const want = 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif';
  assert.equal(G.gifFromUrl('https://giphy.com/gifs/mind-blown-xT0xeJpnrWC4XWblEk'), want);
  assert.equal(G.gifFromUrl('https://media3.giphy.com/media/v1.Y2lkPTc5/xT0xeJpnrWC4XWblEk/200w.gif?cid=1'), want);
  assert.equal(G.gifFromUrl('https://i.giphy.com/xT0xeJpnrWC4XWblEk.gif'), want);
  assert.equal(
    G.gifFromUrl('https://www.youtube.com/redirect?event=comments&q=' + encodeURIComponent('https://giphy.com/gifs/xT0xeJpnrWC4XWblEk')),
    want,
  );
  assert.equal(G.gifFromUrl('https://media.tenor.com/abc123/dance.gif'), 'https://media.tenor.com/abc123/dance.gif');
});

test('only allowed hosts and https links are shown as images', () => {
  assert.equal(G.gifFromUrl('https://evil.example.com/pixel.gif'), null);
  assert.equal(G.gifFromUrl('http://media.tenor.com/abc/dance.gif'), null);
  assert.equal(G.gifFromUrl('https://i.imgur.com/abc.png'), null);
  assert.equal(G.gifFromUrl('not a url'), null);
});

test('pasted input turns into the text that goes into the comment', () => {
  assert.equal(G.textForInput('https://giphy.com/gifs/thank-you-26gsjCZpPolPr3sBy'), '[gif:26gsjCZpPolPr3sBy]');
  assert.equal(G.textForInput('ZqlvCTNHpqrio'), '[gif:ZqlvCTNHpqrio]');
  assert.equal(G.textForInput('https://i.imgur.com/abc123.gif'), 'https://i.imgur.com/abc123.gif');
  assert.equal(G.textForInput('thumbsup'), null);
  assert.equal(G.textForInput('cat'), null);
});

test('built-in GIF search matches every word', () => {
  assert.ok(G.searchBuiltIn('').length >= 30);
  assert.ok(G.searchBuiltIn('cat').every((g) => g.tags.includes('cat')));
  assert.equal(G.searchBuiltIn('thumbs up')[0].id, '111ebonMs90YLu');
  assert.equal(G.searchBuiltIn('zzzz').length, 0);
});
