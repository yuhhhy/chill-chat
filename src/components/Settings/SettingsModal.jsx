import React, { useEffect, useState } from 'react';
import './SettingsModal.css';
import { useSettingsStore } from '../../stores/settingsStore';
import { assets } from '../../assets/assets';
import ModelAvatar from '../ModelAvatar/ModelAvatar';
import { EditIcon } from '../icons/ActionIcons';
import { modelProviderOptions } from '../../config/modelProviders';
import { createCustomModel, deleteCustomModel, updateCustomModel } from '../../api/modelConfig';
import { fetchRagConfig } from '../../api/rag';

const settingsItems = [
  { id: 'general', label: '通用设置' },
  { id: 'model', label: '模型设置' },
  { id: 'prompts', label: '提示词设置' },
  { id: 'privacy', label: '隐私与数据' },
  { id: 'about', label: '关于' }
];

const contextTurnOptions = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: -1, label: '全部' }
];

const emptyCustomModelForm = {
  apiKey: '',
  apiUrl: '',
  label: '',
  model: ''
};

const emptySystemPromptForm = {
  title: '',
  content: ''
};

function formatEmbeddingModel(model) {
  if (!model) return '未配置';
  if (model.includes('3-small')) return 'text-embedding-3-small';
  if (model.includes('3-large')) return 'text-embedding-3-large';
  return model;
}

const SettingsModal = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [isCustomModelEditorOpen, setIsCustomModelEditorOpen] = useState(false);
  const [customModelEditor, setCustomModelEditor] = useState(null);
  const [customModelForm, setCustomModelForm] = useState(emptyCustomModelForm);
  const [customModelError, setCustomModelError] = useState('');
  const [isDeletingCustomModel, setIsDeletingCustomModel] = useState(false);
  const [isSavingCustomModel, setIsSavingCustomModel] = useState(false);
  const [systemPromptEditor, setSystemPromptEditor] = useState(null);
  const [systemPromptForm, setSystemPromptForm] = useState(emptySystemPromptForm);
  const [systemPromptError, setSystemPromptError] = useState('');
  const [ragConfig, setRagConfig] = useState(null);
  const [ragConfigError, setRagConfigError] = useState('');

  const contextTurnCount = useSettingsStore(s => s.contextTurnCount);
  const createSystemPrompt = useSettingsStore(s => s.createSystemPrompt);
  const customModels = useSettingsStore(s => s.customModels);
  const deleteSystemPrompt = useSettingsStore(s => s.deleteSystemPrompt);
  const modelProvider = useSettingsStore(s => s.modelProvider);
  const refreshModelConfig = useSettingsStore(s => s.refreshModelConfig);
  const setContextTurnCount = useSettingsStore(s => s.setContextTurnCount);
  const setModelProvider = useSettingsStore(s => s.setModelProvider);
  const setSelectedSystemPromptId = useSettingsStore(s => s.setSelectedSystemPromptId);
  const setTheme = useSettingsStore(s => s.setTheme);
  const systemPrompts = useSettingsStore(s => s.systemPrompts);
  const selectedSystemPromptId = useSettingsStore(s => s.selectedSystemPromptId);
  const theme = useSettingsStore(s => s.theme);
  const updateSystemPrompt = useSettingsStore(s => s.updateSystemPrompt);

  const isDarkMode = theme === 'dark';
  const contextTurnIndex = Math.max(
    contextTurnOptions.findIndex((option) => option.value === contextTurnCount),
    0
  );
  const contextTurnLabel = contextTurnOptions[contextTurnIndex].label;
  const customModelOptions = customModels.map((model) => ({
    ...model,
    tone: 'custom',
    isCustom: true,
    description: model.model || model.description
  }));
  const allModelOptions = [...modelProviderOptions, ...customModelOptions];

  useEffect(() => {
    let isMounted = true;
    fetchRagConfig()
      .then((config) => {
        if (!isMounted) return;
        setRagConfig(config);
        setRagConfigError('');
      })
      .catch((error) => {
        if (!isMounted) return;
        setRagConfigError(error.message || '读取失败');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const openCustomModelEditor = (model = null) => {
    setIsCustomModelEditorOpen(true);
    setCustomModelEditor(model);
    setCustomModelError('');
    setCustomModelForm(model ? {
      apiKey: '',
      apiUrl: model.apiUrl || '',
      label: model.label || '',
      model: model.model || ''
    } : emptyCustomModelForm);
  };

  const updateCustomModelField = (field, value) => {
    setCustomModelForm((current) => ({ ...current, [field]: value }));
  };

  const openSystemPromptEditor = (prompt = null) => {
    setSystemPromptEditor(prompt);
    setSystemPromptError('');
    setSystemPromptForm(prompt ? {
      title: prompt.title || '',
      content: prompt.content || ''
    } : emptySystemPromptForm);
  };

  const updateSystemPromptField = (field, value) => {
    setSystemPromptForm((current) => ({ ...current, [field]: value }));
  };

  const saveSystemPrompt = (event) => {
    event.preventDefault();

    const title = systemPromptForm.title.trim();
    const content = systemPromptForm.content.trim();

    if (!title) {
      setSystemPromptError('请输入提示词名称');
      return;
    }
    if (!content) {
      setSystemPromptError('请输入提示词内容');
      return;
    }

    if (systemPromptEditor) {
      updateSystemPrompt(systemPromptEditor.id, { title, content });
    } else {
      const prompt = createSystemPrompt({ title, content });
      setSelectedSystemPromptId(prompt.id);
    }

    setSystemPromptEditor(null);
    setSystemPromptForm(emptySystemPromptForm);
    setSystemPromptError('');
  };

  const removeSystemPrompt = (promptId) => {
    const targetPrompt = systemPrompts.find(prompt => prompt.id === promptId);
    const confirmed = window.confirm(`确定要删除提示词「${targetPrompt?.title || '未命名'}」吗？`);
    if (!confirmed) return;

    deleteSystemPrompt(promptId);
    if (systemPromptEditor?.id === promptId) {
      setSystemPromptEditor(null);
      setSystemPromptForm(emptySystemPromptForm);
      setSystemPromptError('');
    }
  };

  const saveCustomModel = async (event) => {
    event.preventDefault();
    setIsSavingCustomModel(true);
    setCustomModelError('');

    try {
      const updatedCustomModels = customModelEditor
        ? await updateCustomModel(customModelEditor.id, customModelForm)
        : await createCustomModel(customModelForm);

      refreshModelConfig();
      const savedModel = customModelEditor
        ? updatedCustomModels.find((model) => model.id === customModelEditor.id)
        : updatedCustomModels[updatedCustomModels.length - 1];

      if (savedModel) setModelProvider(savedModel.id);
      setIsCustomModelEditorOpen(false);
      setCustomModelEditor(null);
      setCustomModelForm(emptyCustomModelForm);
    } catch (error) {
      setCustomModelError(error.message || '保存失败');
    } finally {
      setIsSavingCustomModel(false);
    }
  };

  const removeCustomModel = async () => {
    if (!customModelEditor) return;

    setIsDeletingCustomModel(true);
    setCustomModelError('');

    try {
      await deleteCustomModel(customModelEditor.id);
      refreshModelConfig();

      if (modelProvider === customModelEditor.id) {
        setModelProvider('deepseek');
      }

      setIsCustomModelEditorOpen(false);
      setCustomModelEditor(null);
      setCustomModelForm(emptyCustomModelForm);
    } catch (error) {
      setCustomModelError(error.message || '删除失败');
    } finally {
      setIsDeletingCustomModel(false);
    }
  };

  const selectModelProvider = (modelId) => {
    setModelProvider(modelId);
  };

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <h2 id="settings-title">系统设置</h2>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </header>

        <div className="settings-body">
          <aside className="settings-nav" aria-label="设置列表">
            {settingsItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <main className="settings-panel">
            {activeSection === 'general' ? (
              <div className="settings-section">
                <div className="settings-section-heading">
                  <h3>通用设置</h3>
                  <p>调整应用的通用设置偏好。</p>
                </div>

                <div className="settings-row">
                  <span className="settings-row-copy">
                    <span className="settings-row-title">黑夜模式</span>
                    <span className="settings-row-description">切换到低亮度界面，适合夜间或弱光环境。</span>
                  </span>
                  <button
                    type="button"
                    className={`theme-switch ${isDarkMode ? 'active' : ''}`}
                    role="switch"
                    aria-label="黑夜模式"
                    aria-checked={isDarkMode}
                    onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
                  >
                    <span className="theme-switch-track">
                      <span className="theme-switch-thumb" />
                    </span>
                    <span className="theme-switch-label">{isDarkMode ? '开启' : '关闭'}</span>
                  </button>
                </div>

                <div className="settings-row settings-row-stacked">
                  <span className="settings-row-copy">
                    <span className="settings-row-title">携带上下文对话次数</span>
                    <span className="settings-row-description">
                      每次发送时额外带上最近几轮历史对话；数值越大，连续性越好，但请求会更长。
                    </span>
                  </span>

                  <div className="context-slider-control">
                    <div className="context-slider-value" aria-live="polite">
                      {contextTurnCount === -1 ? '全部历史' : `${contextTurnCount} 轮`}
                    </div>
                    <input
                      className="context-slider"
                      type="range"
                      min="0"
                      max={contextTurnOptions.length - 1}
                      step="1"
                      value={contextTurnIndex}
                      aria-label="携带上下文对话次数"
                      aria-valuetext={contextTurnCount === -1 ? '全部历史' : `${contextTurnCount} 轮`}
                      onChange={(event) => {
                        const nextOption = contextTurnOptions[Number(event.target.value)];
                        setContextTurnCount(nextOption.value);
                      }}
                      style={{
                        '--slider-progress': `${(contextTurnIndex / (contextTurnOptions.length - 1)) * 100}%`,
                        '--slider-step': `${100 / (contextTurnOptions.length - 1)}%`
                      }}
                    />
                    <div className="context-slider-marks" aria-hidden="true">
                      {contextTurnOptions.map((option) => (
                        <span
                          key={option.value}
                          className={`context-slider-mark ${option.label === contextTurnLabel ? 'active' : ''}`}
                          style={{ left: `${(contextTurnOptions.indexOf(option) / (contextTurnOptions.length - 1)) * 100}%` }}
                        >
                          {option.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : activeSection === 'model' ? (
              <>
                <div className="settings-section-heading">
                  <h3>模型设置</h3>
                  <p>调整应用的模型设置偏好。</p>
                </div>
                <div className="model-grid" role="radiogroup" aria-label="选择模型">
                  {allModelOptions.map((model) => (
                    <div
                      key={model.id}
                      className={`model-option ${modelProvider === model.id ? 'active' : ''}`}
                      onClick={() => selectModelProvider(model.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectModelProvider(model.id);
                        }
                      }}
                      role="radio"
                      aria-checked={modelProvider === model.id}
                      tabIndex={0}
                    >
                      {model.isCustom ? (
                        <button
                          type="button"
                          className="custom-model-edit"
                          aria-label={`编辑 ${model.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openCustomModelEditor(model);
                          }}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      <ModelAvatar provider={model.id} className="model-option-avatar" />
                      <span className="model-option-copy">
                        <span className="model-option-name">{model.label}</span>
                        <span className="model-option-description">{model.description}</span>
                      </span>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="model-option model-option-add"
                    onClick={() => openCustomModelEditor()}
                    aria-label="添加自定义模型"
                  >
                    <span className="model-add-icon" aria-hidden="true">+</span>
                  </button>
                </div>
                <div className="embedding-model-row">
                  <span className="settings-row-copy">
                    <span className="settings-row-title">RAG Embedding 模型</span>
                    <span className="settings-row-description">
                      知识库检索向量化当前使用的模型。
                    </span>
                  </span>
                  <span className="embedding-model-value">
                    {ragConfigError || formatEmbeddingModel(ragConfig?.embedding?.model)}
                  </span>
                </div>
              </>
            ) : activeSection === 'prompts' ? (
              <div className="settings-section">
                <div className="settings-section-heading settings-section-heading-row">
                  <div className="settings-heading-copy">
                    <h3>提示词设置</h3>
                    <p>管理聊天时可选的系统提示词。</p>
                  </div>
                </div>

                {systemPrompts.length > 0 ? (
                  <div className="system-prompt-list">
                    {systemPrompts.map((prompt) => (
                      <article
                        key={prompt.id}
                        className={`system-prompt-item ${selectedSystemPromptId === prompt.id ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="system-prompt-main"
                          onClick={() => setSelectedSystemPromptId(selectedSystemPromptId === prompt.id ? '' : prompt.id)}
                          aria-pressed={selectedSystemPromptId === prompt.id}
                        >
                          <span className="system-prompt-title">{prompt.title}</span>
                          <span className="system-prompt-preview">{prompt.content}</span>
                        </button>
                        <span className="system-prompt-actions">
                          <button
                            type="button"
                            className="system-prompt-icon-button"
                            onClick={() => openSystemPromptEditor(prompt)}
                            aria-label={`编辑 ${prompt.title}`}
                            title="编辑"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className="system-prompt-delete"
                            onClick={() => removeSystemPrompt(prompt.id)}
                            aria-label={`删除 ${prompt.title}`}
                            title="删除"
                          >
                            <span
                              className="system-prompt-trash-icon"
                              style={{ '--icon-url': `url(${assets.trash})` }}
                              aria-hidden="true"
                            />
                          </button>
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="system-prompt-empty">
                    <h4>还没有提示词</h4>
                    <p>新增后可以在聊天页标题旁快速切换。</p>
                  </div>
                )}

                <form className="system-prompt-form" onSubmit={saveSystemPrompt}>
                  <div className="system-prompt-form-heading">
                    <h4>{systemPromptEditor ? '编辑提示词' : '新增提示词'}</h4>
                    {systemPromptEditor ? (
                      <button
                        type="button"
                        className="system-prompt-cancel"
                        onClick={() => {
                          setSystemPromptEditor(null);
                          setSystemPromptForm(emptySystemPromptForm);
                          setSystemPromptError('');
                        }}
                      >
                        取消编辑
                      </button>
                    ) : null}
                  </div>

                  <label className="custom-model-field">
                    <span>名称</span>
                    <input
                      type="text"
                      value={systemPromptForm.title}
                      onChange={(event) => updateSystemPromptField('title', event.target.value)}
                    />
                  </label>

                  <label className="custom-model-field">
                    <span>提示词内容</span>
                    <textarea
                      value={systemPromptForm.content}
                      onChange={(event) => updateSystemPromptField('content', event.target.value)}
                      rows={7}
                    />
                  </label>

                  {systemPromptError ? <p className="custom-model-error">{systemPromptError}</p> : null}

                  <div className="system-prompt-form-actions">
                    <button type="submit" className="system-prompt-submit">
                      {systemPromptEditor ? '保存' : '新增'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="settings-placeholder">
                <h3>{settingsItems.find((item) => item.id === activeSection)?.label}</h3>
                <p>这个设置页后续再接入。</p>
              </div>
            )}
          </main>
        </div>
      </section>

      {isCustomModelEditorOpen ? (
        <section
          className="custom-model-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-model-editor-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <form className="custom-model-form" onSubmit={saveCustomModel}>
            <div className="custom-model-form-heading">
              <h3 id="custom-model-editor-title">
                {customModelEditor ? '编辑自定义模型' : '添加自定义模型'}
              </h3>
              <button
                type="button"
                className="settings-close"
                onClick={() => {
                  setIsCustomModelEditorOpen(false);
                  setCustomModelEditor(null);
                  setCustomModelForm(emptyCustomModelForm);
                }}
                aria-label="关闭自定义模型编辑"
              >
                ×
              </button>
            </div>

            <label className="custom-model-field">
              <span>显示名称</span>
              <input
                type="text"
                value={customModelForm.label}
                onChange={(event) => updateCustomModelField('label', event.target.value)}
                placeholder="例如：本地 Qwen"
                autoFocus
              />
            </label>

            <label className="custom-model-field">
              <span>API 地址</span>
              <input
                type="url"
                value={customModelForm.apiUrl}
                onChange={(event) => updateCustomModelField('apiUrl', event.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>

            <label className="custom-model-field">
              <span>模型 ID</span>
              <input
                type="text"
                value={customModelForm.model}
                onChange={(event) => updateCustomModelField('model', event.target.value)}
                placeholder="例如：gpt-4o-mini"
              />
            </label>

            <label className="custom-model-field">
              <span>API key</span>
              <input
                type="password"
                value={customModelForm.apiKey}
                onChange={(event) => updateCustomModelField('apiKey', event.target.value)}
                placeholder={customModelEditor ? '留空则保留当前 key' : 'sk-...'}
              />
            </label>

            {customModelError ? <p className="custom-model-error">{customModelError}</p> : null}

            <div className="custom-model-actions">
              <span className="custom-model-action-start">
                {customModelEditor ? (
                  <button
                    type="button"
                    className="custom-model-danger"
                    onClick={removeCustomModel}
                    disabled={isDeletingCustomModel || isSavingCustomModel}
                  >
                    {isDeletingCustomModel ? '删除中' : '删除'}
                  </button>
                ) : null}
              </span>
              <span className="custom-model-action-end">
                <button
                  type="button"
                  className="custom-model-secondary"
                  disabled={isDeletingCustomModel || isSavingCustomModel}
                  onClick={() => {
                    setIsCustomModelEditorOpen(false);
                    setCustomModelEditor(null);
                    setCustomModelForm(emptyCustomModelForm);
                  }}
                >
                  取消
                </button>
                <button type="submit" className="custom-model-primary" disabled={isSavingCustomModel || isDeletingCustomModel}>
                  {isSavingCustomModel ? '保存中' : '保存'}
                </button>
              </span>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
};

export default SettingsModal;
