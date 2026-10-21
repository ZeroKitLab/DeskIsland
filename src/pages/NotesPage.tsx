// 笔记页：支持多条笔记，并在编辑时自动保存到本机。
import { useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import type { AppCtx } from "../ctx";

interface Props {
  ctx: AppCtx;
}

function formatEditedAt(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export default function NotesPage({ ctx }: Props) {
  const { notes, addNote, updateNote, removeNote } = ctx;
  const [selectedId, setSelectedId] = useState<string | null>(() => notes[0]?.id ?? null);
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !notes.some((note) => note.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null);
    } else if (!selectedId && notes.length) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

  const createNote = () => setSelectedId(addNote());

  const deleteSelectedNote = () => {
    if (!selectedNote || !window.confirm("确定删除这条笔记吗？此操作无法撤销。")) return;
    const remaining = notes.filter((note) => note.id !== selectedNote.id);
    removeNote(selectedNote.id);
    setSelectedId(remaining[0]?.id ?? null);
  };

  return (
    <div className="page notes-page">
      <header className="notes-heading">
        <div>
          <h1>笔记</h1>
          <span>自动保存到此设备</span>
        </div>
        <button className="soft-btn notes-new-btn" onClick={createNote}>
          <Plus size={15} />
          新建笔记
        </button>
      </header>

      <div className="notes-layout">
        <aside className="notes-sidebar" aria-label="笔记列表">
          <div className="notes-sidebar-label">全部笔记 <span>{notes.length}</span></div>
          {notes.length ? (
            <div className="notes-list">
              {notes.map((note) => (
                <button
                  key={note.id}
                  className={`notes-list-item ${note.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(note.id)}
                >
                  <span className="notes-list-title">{note.title.trim() || "无标题"}</span>
                  <span className="notes-list-preview">{note.content.trim().replace(/\s+/g, " ") || "空白笔记"}</span>
                  <span className="notes-list-date">{formatEditedAt(note.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="notes-list-empty">还没有笔记</div>
          )}
        </aside>

        {selectedNote ? (
          <section className="notes-editor" aria-label="笔记编辑器">
            <input
              className="notes-title-input"
              value={selectedNote.title}
              placeholder="无标题"
              aria-label="笔记标题"
              onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })}
            />
            <div className="notes-editor-meta">
              <span>最近编辑 {formatEditedAt(selectedNote.updatedAt)}</span>
              <button className="icon-btn small notes-delete-btn" title="删除笔记" onClick={deleteSelectedNote}>
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              className="notes-content-input"
              value={selectedNote.content}
              placeholder="从这里开始记录…"
              aria-label="笔记内容"
              onChange={(event) => updateNote(selectedNote.id, { content: event.target.value })}
            />
          </section>
        ) : (
          <section className="notes-empty-editor">
            <span><FileText size={20} /></span>
            <b>把想法记下来</b>
            <i>笔记会自动保存在这台设备上</i>
            <button className="soft-btn" onClick={createNote}>新建第一条笔记</button>
          </section>
        )}
      </div>
    </div>
  );
}
