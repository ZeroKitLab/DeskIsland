// 通知中心
import { useEffect } from "react";
import { Bell, CheckCheck, Inbox, Sparkles, Trash2 } from "lucide-react";
import type { AppCtx } from "../ctx";

interface Props {
  ctx: AppCtx;
}

function ago(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function NotificationsPage({ ctx }: Props) {
  const { notifs, markAllNotifsRead, clearNotifs, addNotif } = ctx;

  // 进入页面时清空未读角标
  useEffect(() => {
    markAllNotifsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page notif-page">
      <div className="page-actions">
        <button className="soft-btn" onClick={() => addNotif("系统", "测试通知", "这是一条示例通知，会短暂显示在顶部刘海条中。")}>
          <Sparkles size={13} /> 发送测试通知
        </button>
        <button className="soft-btn" onClick={() => addNotif("天气", "出行提醒", "今天傍晚可能有降雨，出门记得带伞。")}>
          天气示例
        </button>
        {notifs.length > 0 && (
          <button className="soft-btn danger" onClick={clearNotifs}>
            <Trash2 size={13} /> 清空
          </button>
        )}
      </div>

      {notifs.length === 0 ? (
        <div className="empty-state">
          <Inbox size={28} className="dim" />
          <div className="dim">暂无通知。测试通知与待办提醒会出现在这里，并短暂浮现在顶部刘海条。</div>
        </div>
      ) : (
        <div className="notif-list">
          {notifs.map((n) => (
            <div key={n.id} className="notif-row">
              <span className="notif-row-ic">
                <Bell size={15} />
              </span>
              <div className="notif-row-main">
                <div className="notif-row-top">
                  <b>{n.app}</b>
                  <span className="dim">{ago(n.time)}</span>
                </div>
                <div className="notif-row-title">{n.title}</div>
                <div className="notif-row-body">{n.body}</div>
              </div>
              <CheckCheck size={14} className="dim" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
