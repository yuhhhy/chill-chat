import React, { useEffect } from "react";
import "./Main.css";
import { assets } from "../../assets/assets";
import { useChatStore } from "../../stores/chatStore";
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

  const showResult = messages.length > 0;

  useEffect(() => {
    if (messages.length === 0) return;
    if (!isAtBottom) return;
    scrollToBottom(isGenerating ? "auto" : "smooth", messages.length);
  }, [isAtBottom, isGenerating, messages.length, scrollToBottom]);

  return (
    <div className="main">
      <div className="nav">
        <p>chillAI</p>
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
