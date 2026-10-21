// 待办事项页
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import type { AppCtx } from "../ctx";

interface Props {
  ctx: AppCtx;
}

export default function TodoPage({ ctx }: Props) {
  const { todos, addTodo, toggleTodo, removeTodo, clearTodos } = ctx;
  const [text, setText] = useState("");
  const done = todos.filter((t) => t.done).length;

  const submit = () => {
    if (!text.trim()) return;
    addTodo(text);
    setText("");
  };

  return (
    <div className="page todo-page">
      <div className="todo-input-row">
        <input
          value={text}
          placeholder="添加一项待办…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send-btn" onClick={submit} disabled={!text.trim()}>
          <Plus size={16} />
        </button>
      </div>

      {todos.length === 0 ? (
        <div className="empty-state">
          <div className="dim">暂无待办事项，一切轻松。</div>
        </div>
      ) : (
        <div className="todo-list">
          {todos.map((t) => (
            <div key={t.id} className={`todo-item ${t.done ? "is-done" : ""}`}>
              <button
                className={`todo-check ${t.done ? "on" : ""}`}
                onClick={() => toggleTodo(t.id)}
                title={t.done ? "标记未完成" : "标记完成"}
              >
                {t.done && <Check size={12} strokeWidth={3} />}
              </button>
              <span className="todo-text">{t.text}</span>
              <button className="icon-btn small" title="删除" onClick={() => removeTodo(t.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {todos.length > 0 && (
        <div className="todo-footer">
          <span className="dim">
            已完成 {done}/{todos.length}
          </span>
          <button className="soft-btn danger" onClick={clearTodos}>
            清空全部
          </button>
        </div>
      )}
    </div>
  );
}
