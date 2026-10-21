// AI 对话页
import { useEffect, useRef, useState } from "react";
import { Eraser, Send, Square } from "lucide-react";
import type { AppCtx } from "../ctx";
import type { ChatMessage } from "../types";

interface Props {
  ctx: AppCtx;
}

export default function ChatPage({ ctx }: Props) {
  const { messages, busy, sendMessage, stopChat, clearChat, settings } = ctx;
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    const t = input.trim();
    if (!t || busy || !settings.aiKey) return;
    setInput("");
    void sendMessage(t);
  };

  return (
    <div className="page chat-page">
      <div className="chat-toolbar">
        <span className="tag">模型：{settings.aiModel || "未设置"}</span>
        {!settings.aiKey && <span className="tag warn">尚未配置 API Key</span>}
        <button className="icon-btn small" title="清空会话" disabled={!messages.length} onClick={clearChat}>
          <Eraser size={13} />
        </button>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-title">你好，我是你的桌面助手</div>
            <div className="dim">可以问我任何问题。如需使用，请在“设置 - AI 服务”中填入接口地址与密钥。</div>
          </div>
        )}
        {messages.map((m, i) => (
          <Msg key={i} m={m} />
        ))}
        {busy && messages[messages.length - 1]?.content === "" && (
          <div className="msg row-assistant">
            <div className="msg-bubble typing"><span /><span /><span /></div>
          </div>
        )}
      </div>

      <div className="chat-input-bar">
        <textarea
          value={input}
          rows={Math.min(4, Math.max(1, input.split("\n").length))}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="send-btn stop" onClick={stopChat} title="停止生成">
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={submit}
            disabled={!input.trim() || !settings.aiKey}
            title={!settings.aiKey ? "请先配置 API Key" : input.trim() ? "发送" : "请输入消息"}
          >
            <Send size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function Msg({ m }: { m: ChatMessage }) {
  return (
    <div className={`msg row-${m.role}`}>
      <div className={`msg-bubble ${m.role === "assistant" ? "" : "self"}`}>
        <pre className="msg-content">{m.content || " "}</pre>
      </div>
    </div>
  );
}
