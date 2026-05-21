import React, { useEffect } from "react";
import "./Main.css";
import { assets } from "../../assets/assets";
import { useChatStore } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import WelcomeScreen from "./WelcomeScreen";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

const Main = () => {
  const isAtBottom = useUIStore(s => s.isAtBottom);
  const scrollToBottom = useUIStore(s => s.scrollToBottom);
  const isGenerating = useChatStore(s => s.isGenerating);
  const isLoadingMessages = useChatStore(s => s.isLoadingMessages);
  const messages = useChatStore(s => s.messages);
  const selectedSystemPromptId = useSettingsStore(s => s.selectedSystemPromptId);
  const setSelectedSystemPromptId = useSettingsStore(s => s.setSelectedSystemPromptId);
  const systemPrompts = useSettingsStore(s => s.systemPrompts);

  const showResult = messages.length > 0;

  useEffect(() => {
    if (messages.length === 0) return;
    if (!isAtBottom) return;
    scrollToBottom(isGenerating ? "auto" : "smooth", messages.length);
  }, [isAtBottom, isGenerating, messages.length, scrollToBottom]);

  return (
    <div className="main">
      <div className="nav">
        <div className="nav-title-group">
          <p>chillAI</p>
          <label className={`system-prompt-select ${selectedSystemPromptId ? 'active' : ''}`}>
            <span className="system-prompt-select-label">提示词</span>
            <select
              value={selectedSystemPromptId}
              onChange={(event) => setSelectedSystemPromptId(event.target.value)}
              aria-label="选择系统提示词"
            >
              <option value="">无提示词</option>
              {systemPrompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <img src={assets.user_icon} alt="" />
      </div>
      <div className="main-container">
        {isLoadingMessages ? null : !showResult ? (
          <WelcomeScreen />
        ) : (
          <MessageList />
        )}
        <ChatInput />
      </div>
    </div>
  );
};

export default Main;
