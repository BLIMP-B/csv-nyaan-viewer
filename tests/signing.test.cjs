'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function config(variables = {}) {
  return spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(require("./electron-builder.config.cjs").win))'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, WIN_CSC_LINK: '', CSC_LINK: '', CSV_REQUIRE_CODE_SIGNATURE: '', CSV_TEST_CERT_THUMBPRINT: '', ...variables }
  });
}
test('証明書未設定の配布設定は署名済みとは扱わない', () => {
  const result = config(); assert.equal(result.status, 0);
  const win = JSON.parse(result.stdout); assert.equal(win.forceCodeSigning, false); assert.equal(win.signAndEditExecutable, true); assert.equal(win.icon, 'assets/icon.ico');
});
test('証明書設定後は署名失敗時の未署名配布を許可しない', () => {
  for (const variable of ['WIN_CSC_LINK', 'CSC_LINK']) {
    const result = config({ [variable]: 'test-certificate.pfx' }); assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).forceCodeSigning, true);
  }
});
test('署名必須で証明書がない場合はビルド設定を拒否する', () => {
  const result = config({ CSV_REQUIRE_CODE_SIGNATURE: 'true' }); assert.notEqual(result.status, 0); assert.match(result.stderr, /コード署名証明書が未設定/);
});
