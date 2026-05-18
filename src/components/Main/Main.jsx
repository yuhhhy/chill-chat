import React, { useContext, useEffect } from "react";
import "./Main.css";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";
import WelcomeScreen from "./WelcomeScreen";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

const Main = () => {
  const { isGenerating, isLoadingMessages, messages, scrollToBottom } = useContext(Context);

  const showResult = messages.length > 0;

  useEffect(() => {
    if (messages.length === 0) return;
    scrollToBottom(isGenerating ? "auto" : "smooth");
  }, [isGenerating, messages.length, scrollToBottom]);

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
