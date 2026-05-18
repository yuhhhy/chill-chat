import React, { useContext, useState } from 'react';
import './SettingsModal.css';
import { Context } from '../../context/Context';
import ModelAvatar from '../ModelAvatar/ModelAvatar';
import { modelProviderOptions } from '../../config/modelProviders';

const settingsItems = [
  { id: 'general', label: '通用设置' },
  { id: 'model', label: '模型设置' },
  { id: 'privacy', label: '隐私与数据' },
  { id: 'about', label: '关于' }
];

const SettingsModal = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState('model');
  const { modelProvider, setModelProvider } = useContext(Context);

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
            {activeSection === 'model' ? (
              <>
                <div className="settings-panel-heading">
                  <p className="settings-kicker">Model Provider</p>
                  <h3>模型设置</h3>
                </div>

                <div className="model-grid" role="radiogroup" aria-label="选择模型">
                  {modelProviderOptions.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={`model-option ${modelProvider === model.id ? 'active' : ''}`}
                      onClick={() => setModelProvider(model.id)}
                      role="radio"
                      aria-checked={modelProvider === model.id}
                    >
                      <ModelAvatar provider={model.id} className="model-option-avatar" />
                      <span className="model-option-copy">
                        <span className="model-option-name">{model.label}</span>
                        <span className="model-option-description">{model.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="settings-placeholder">
                <h3>{settingsItems.find((item) => item.id === activeSection)?.label}</h3>
                <p>这个设置页后续再接入。</p>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
};

export default SettingsModal;
