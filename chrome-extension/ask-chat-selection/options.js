const DEFAULT_OPTIONS = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  enableAnswerFormatInstruction: true,
  answerFormatInstruction: ''
};

const fields = {
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  temperature: document.getElementById('temperature'),
  enableAnswerFormatInstruction: document.getElementById('enableAnswerFormatInstruction'),
  answerFormatInstruction: document.getElementById('answerFormatInstruction')
};
const status = document.getElementById('status');

async function loadOptions() {
  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === 'checkbox') {
      field.checked = Boolean(options[key] ?? DEFAULT_OPTIONS[key]);
    } else {
      field.value = options[key] ?? DEFAULT_OPTIONS[key];
    }
  }
}

async function saveOptions() {
  await chrome.storage.sync.set({
    apiBaseUrl: fields.apiBaseUrl.value.trim() || DEFAULT_OPTIONS.apiBaseUrl,
    apiKey: fields.apiKey.value.trim(),
    model: fields.model.value.trim() || DEFAULT_OPTIONS.model,
    temperature: Number(fields.temperature.value) || DEFAULT_OPTIONS.temperature,
    enableAnswerFormatInstruction: fields.enableAnswerFormatInstruction.checked,
    answerFormatInstruction: fields.answerFormatInstruction.value.trim()
  });

  status.textContent = '已保存';
  window.setTimeout(() => {
    status.textContent = '';
  }, 1600);
}

document.getElementById('save').addEventListener('click', saveOptions);
loadOptions();
