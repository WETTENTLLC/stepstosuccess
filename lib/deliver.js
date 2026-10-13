const fs = require('fs');
const path = require('path');

// Test mode only: validated submissions are written to a git-ignored local file, never sent anywhere.
// Live mode needs a mail or form provider chosen and approved by the organization (Milestone 4).
async function deliver(mode, formId, values, config) {
  if (mode === 'test') {
    const dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'test-outbox.jsonl'), JSON.stringify({ at: new Date().toISOString(), formId, values }) + '\n');
    return;
  }
  const a = config.approvals || {};
  if (!a.recipientsApproved || !a.privacyLanguageApproved || !a.retentionPolicyApproved || !config.recipients[formId]) {
    throw new Error('Live delivery blocked: organizational approvals are incomplete.');
  }
  throw new Error('Live delivery blocked: no mail provider has been configured.');
}

module.exports = { deliver };
