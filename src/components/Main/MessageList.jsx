import React, { useContext } from "react";
import { Virtuoso } from "react-virtuoso";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";
import MarkdownRenderer from "../MarkdownRenderer/MarkdownRenderer";

const MessageRow = ({ message }) => (
  <div className={`message-item ${message.role === "assistant" ? "ai-message" : "user-message"}`}>
    <img
      src={message.role === "assistant" ? assets.deepseek_icon : assets.user_icon}
      alt=""
      className="message-avatar"
    />
    <div className="message-content">
      {message.status === "generating" && !message.content ? (
        <div className="thinking-indicator">
          <div className="thinking-spinner" />
          <span>思考中</span>
        </div>
      ) : (
        <div className="markdown-content">
          <MarkdownRenderer content={message.content} />
        </div>
      )}
      {message.status === "aborted" && <p className="message-status aborted">— 已中断</p>}
      {message.status === "failed"  && <p className="message-status failed">生成失败，请重试</p>}
    </div>
  </div>
);

const MessageList = () => {
  const { messages, isAtBottom, setIsAtBottom, virtuosoRef } = useContext(Context);

  return (
    <div className="result">
      <div className="chat-messages">
        <Virtuoso
          ref={virtuosoRef}
          className="chat-virtuoso"
          data={messages}
          followOutput={isAtBottom ? "auto" : false}
          itemContent={(index, message) => <MessageRow key={message.id || index} message={message} />}
          atBottomStateChange={(bottom) => setIsAtBottom(bottom)}
          overscan={240}
        />
      </div>
    </div>
  );
};

export default MessageList;
