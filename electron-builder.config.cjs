'use strict';
const config = require('./package.json').build;
const fs = require('node:fs');
const path = require('node:path');
const testThumbprint = process.env.CSV_TEST_CERT_THUMBPRINT?.trim();
if (testThumbprint && !/^[a-f\d]{40}$/i.test(testThumbprint)) throw Error('自己署名証明書の拇印が不正です。');
const publicCertificate = path.join(__dirname, 'release/test-signing.cer');
if (testThumbprint && !fs.existsSync(publicCertificate)) throw Error('自己署名用の公開証明書がありません。scripts/new-test-certificate.ps1を実行してください。');
const hasCertificate = Boolean(testThumbprint || process.env.WIN_CSC_LINK?.trim() || process.env.CSC_LINK?.trim());
const requireSignature = /^(true|1)$/i.test(process.env.CSV_REQUIRE_CODE_SIGNATURE || '');
if (requireSignature && !hasCertificate) throw Error('コード署名証明書が未設定です。自己署名用の証明書、WIN_CSC_LINKまたはCSC_LINKを設定してください。');
module.exports = {
  ...config,
  extraFiles: [...config.extraFiles, ...(testThumbprint ? [{ from: publicCertificate, to: 'test-signing.cer' }] : [])],
  win: {
    ...config.win, forceCodeSigning: hasCertificate || requireSignature,
    ...(testThumbprint ? { signtoolOptions: { certificateSha1: testThumbprint, signingHashAlgorithms: ['sha256'] } } : {})
  }
};
