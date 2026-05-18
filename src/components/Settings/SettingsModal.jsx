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
  const [activeSection, setActiveSection] = useState('general');
  const { modelProvider, setModelProvider, setTheme, theme } = useContext(Context);
  const isDarkMode = theme === 'dark';

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
                  <h3>主题</h3>
                  <p>调整应用的基础显示偏好。</p>
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
              </div>
            ) : activeSection === 'model' ? (
              <>
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
