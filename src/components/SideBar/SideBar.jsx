import React, { useContext, useState, useRef, useEffect } from 'react'
import './SideBar.css'
import { assets } from '../../assets/assets'
import { Context } from '../../context/Context';

const COLLAPSED_WIDTH = 68;
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

const SideBar = ({ onOpenSettings }) => {
    const [extended, setExtended] = useState(true);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [isDragging, setIsDragging] = useState(false);
    const isResizing = useRef(false);

    const { sessions, currentSessionId, createNewSession, loadSession, deleteSession } = useContext(Context);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing.current) return;
            setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
        };
        const handleMouseUp = () => {
            isResizing.current = false;
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div
            className={`sidebar ${extended ? '' : 'collapsed'} ${isDragging ? 'resizing' : ''}`}
            style={{ width: extended ? width : COLLAPSED_WIDTH }}
        >
            <div className="top">
                <img className='menu' src={assets.menu_icon} alt="" onClick={() => setExtended(!extended)} />
                <div onClick={() => createNewSession()} className="new-chat">
                    <img src={assets.plus_icon} alt="" />
                    <p className="label">New Chat</p>
                </div>
                <div className="recent">
                    <p className='recent-title label'>Recent</p>
                    <div className="recent-list">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => loadSession(session.id)}
                                className={`recent-entry ${session.id === currentSessionId ? 'active' : ''}`}
                            >
                                <p className="label session-title">{session.title}</p>
                                <img
                                    src={assets.trash}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                    }}
                                    alt=""
                                    className="delete-icon"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="bottom">
                <div className="bottom-item recent-entry">
                    <img src={assets.question_icon} alt="" />
                    <p className="label">Help</p>
                </div>
                <div className="bottom-item recent-entry">
                    <img src={assets.history_icon} alt="" />
                    <p className="label">Activity</p>
                </div>
                <div className="bottom-item recent-entry" onClick={onOpenSettings}>
                    <img src={assets.setting_icon} alt="" />
                    <p className="label">Setting</p>
                </div>
            </div>
            {extended && (
                <div
                    className="resize-handle"
                    onMouseDown={(e) => {
                        isResizing.current = true;
                        setIsDragging(true);
                        e.preventDefault();
                    }}
                />
            )}
        </div>
    )
}

export default SideBar;
